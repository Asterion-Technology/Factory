import { canSendLetter, canTransition, type GateSnapshot, type MatterState } from '@stopallcalls/domain';
import { ServiceError } from './service';
import type { MatterRecord, MatterStore } from './clio';
import type { ApprovalStore, LetterVersionStore } from './letters';

// Phase 5 (DLV-001..007): exactly-once email delivery of the approved letter.
// The send re-verifies the exact hash-bound approval and every gate at the
// moment of sending — approval alone is never enough (SRS exit criterion).

export interface DeliveryRecord {
  id: string;
  matterId: string;
  letterVersionId: string;
  channel: 'EMAIL';
  /** DLV-004: one send per matter+version, enforced by uniqueness. */
  idempotencyKey: string;
  providerMessageId: string | null;
  recipient: string;
  artifactHash: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryStore {
  insert(record: DeliveryRecord): Promise<void>;
  getByIdempotencyKey(key: string): Promise<DeliveryRecord | null>;
  getByProviderMessageId(messageId: string): Promise<DeliveryRecord | null>;
  listByMatter(matterId: string): Promise<DeliveryRecord[]>;
  update(record: DeliveryRecord): Promise<void>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private byId = new Map<string, DeliveryRecord>();

  async insert(record: DeliveryRecord): Promise<void> {
    for (const existing of this.byId.values()) {
      if (existing.idempotencyKey === record.idempotencyKey) {
        throw new ServiceError(409, 'DUPLICATE_DELIVERY', 'A delivery already exists for this letter.');
      }
    }
    this.byId.set(record.id, structuredClone(record));
  }

  async getByIdempotencyKey(key: string): Promise<DeliveryRecord | null> {
    for (const record of this.byId.values()) {
      if (record.idempotencyKey === key) return structuredClone(record);
    }
    return null;
  }

  async getByProviderMessageId(messageId: string): Promise<DeliveryRecord | null> {
    for (const record of this.byId.values()) {
      if (record.providerMessageId === messageId) return structuredClone(record);
    }
    return null;
  }

  async listByMatter(matterId: string): Promise<DeliveryRecord[]> {
    return [...this.byId.values()]
      .filter((d) => d.matterId === matterId)
      .map((d) => structuredClone(d));
  }

  async update(record: DeliveryRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

export interface TaskRecord {
  id: string;
  matterId: string | null;
  intakeId: string | null;
  kind: string;
  status: 'OPEN' | 'DONE';
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStore {
  insert(record: TaskRecord): Promise<void>;
  listByMatter(matterId: string): Promise<TaskRecord[]>;
}

export class InMemoryTaskStore implements TaskStore {
  private byId = new Map<string, TaskRecord>();

  async insert(record: TaskRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async listByMatter(matterId: string): Promise<TaskRecord[]> {
    return [...this.byId.values()]
      .filter((t) => t.matterId === matterId)
      .map((t) => structuredClone(t));
  }
}

export interface LetterEmailSender {
  send(input: {
    idempotencyKey: string;
    to: string;
    bcc?: string;
    from: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string; status: 'QUEUED' | 'SENT' }>;
}

export interface ClioDocumentUploader {
  uploadDocument(input: {
    idempotencyKey: string;
    matterClioId: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<{ clioDocumentId: string }>;
}

const now = (): string => new Date().toISOString();

async function transitionMatter(matters: MatterStore, matter: MatterRecord, to: MatterState): Promise<void> {
  if (matter.state === to) return;
  if (!canTransition(matter.state, to)) {
    throw new ServiceError(409, 'INVALID_TRANSITION', `Matter cannot move to ${to} from its current state.`);
  }
  matter.state = to;
  matter.updatedAt = now();
  await matters.update(matter);
}

export interface SendLetterDeps {
  versions: LetterVersionStore;
  approvals: ApprovalStore;
  deliveries: DeliveryStore;
  matters: MatterStore;
  email: LetterEmailSender;
  /** DLV-005: sent copy recorded in the Clio matter; failure never unsends. */
  clio?: ClioDocumentUploader;
}

export interface SendLetterInput {
  letterVersionId: string;
  recipient: string;
  senderAddress: string;
  gates: GateSnapshot;
  /** DLV-003: client BCC is policy-gated config, never a client choice. */
  bccClient?: string;
}

/**
 * EXIT CRITERION: no send without an exact, valid, hash-bound approval; the
 * send happens exactly once per matter+version regardless of retries.
 */
export async function sendApprovedLetter(
  deps: SendLetterDeps,
  input: SendLetterInput,
): Promise<DeliveryRecord> {
  const version = await deps.versions.getById(input.letterVersionId);
  if (!version) throw new ServiceError(404, 'NOT_FOUND', 'Letter version not found.');
  const matter = await deps.matters.getById(version.matterId);
  if (!matter) throw new ServiceError(404, 'NOT_FOUND', 'Matter not found.');

  const idempotencyKey = `send:${version.matterId}:${version.id}`;
  const existing = await deps.deliveries.getByIdempotencyKey(idempotencyKey);
  if (existing) return existing;

  if (version.status !== 'APPROVED') {
    throw new ServiceError(409, 'NOT_APPROVED', 'Only an approved letter version can be sent.');
  }
  // LTR-007 at the moment of send: an APPROVED decision bound to this exact hash.
  const approvals = await deps.approvals.listByLetterVersion(version.id);
  const valid = approvals.some((a) => a.decision === 'APPROVED' && a.letterContentHash === version.contentHash);
  if (!valid) {
    throw new ServiceError(409, 'APPROVAL_INVALID', 'No valid approval matches this letter content.');
  }
  if (!canSendLetter(input.gates)) {
    throw new ServiceError(409, 'GATES_NOT_PASSED', 'Letter sending requires every workflow gate to have passed.');
  }

  await transitionMatter(deps.matters, matter, 'DELIVERY_QUEUED');
  const record: DeliveryRecord = {
    id: crypto.randomUUID(),
    matterId: version.matterId,
    letterVersionId: version.id,
    channel: 'EMAIL',
    idempotencyKey,
    providerMessageId: null,
    recipient: input.recipient,
    artifactHash: version.contentHash,
    status: 'QUEUED',
    attempts: 1,
    lastError: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await deps.deliveries.insert(record);

  const sent = await deps.email.send({
    idempotencyKey,
    to: input.recipient,
    ...(input.bccClient ? { bcc: input.bccClient } : {}),
    from: input.senderAddress,
    subject: `Cease and desist — matter ${matter.displayNumber}`,
    text: version.sourceSnapshot.renderedContent,
  });
  record.providerMessageId = sent.messageId;
  record.status = 'SENT';
  record.updatedAt = now();
  await deps.deliveries.update(record);
  version.status = 'SENT';
  await deps.versions.update(version);
  await transitionMatter(deps.matters, matter, 'SENT');

  if (deps.clio && matter.clioMatterId) {
    try {
      await deps.clio.uploadDocument({
        idempotencyKey: `clio-doc:${idempotencyKey}`,
        matterClioId: matter.clioMatterId,
        filename: `cease-and-desist-${matter.displayNumber}.txt`,
        bytes: new TextEncoder().encode(version.sourceSnapshot.renderedContent),
      });
    } catch {
      record.lastError = 'CLIO_UPLOAD_FAILED';
      record.updatedAt = now();
      await deps.deliveries.update(record);
    }
  }
  return record;
}

export interface DeliveryEventDeps {
  deliveries: DeliveryStore;
  matters: MatterStore;
  tasks: TaskStore;
}

/**
 * DLV-006/DLV-007: provider delivery events, idempotent per delivery+status.
 * A bounce opens a follow-up task; it never silently retries a legal letter.
 */
export async function recordDeliveryEvent(
  deps: DeliveryEventDeps,
  input: { providerMessageId: string; status: 'DELIVERED' | 'BOUNCED' },
): Promise<DeliveryRecord> {
  const delivery = await deps.deliveries.getByProviderMessageId(input.providerMessageId);
  if (!delivery) throw new ServiceError(404, 'NOT_FOUND', 'No delivery matches this message.');
  if (delivery.status === input.status) return delivery;
  if (delivery.status !== 'SENT') {
    throw new ServiceError(409, 'INVALID_TRANSITION', 'This delivery is not awaiting a provider outcome.');
  }
  const matter = await deps.matters.getById(delivery.matterId);
  if (!matter) throw new ServiceError(404, 'NOT_FOUND', 'Matter not found.');

  delivery.status = input.status;
  delivery.updatedAt = now();
  await deps.deliveries.update(delivery);
  await transitionMatter(deps.matters, matter, input.status === 'DELIVERED' ? 'DELIVERED' : 'BOUNCED');
  if (input.status === 'BOUNCED') {
    await deps.tasks.insert({
      id: crypto.randomUUID(),
      matterId: delivery.matterId,
      intakeId: null,
      kind: 'BOUNCE_FOLLOW_UP',
      status: 'OPEN',
      dueAt: null,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  return delivery;
}
