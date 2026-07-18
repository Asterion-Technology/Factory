import type { GateStatus } from '@stopallcalls/domain';
import { ServiceError } from './service';
import type { IntakeRecord } from './types';

// Phase 4 (RET-001..005): versioned, immutable limited-scope retainer with
// e-signature evidence. Published versions are immutable by construction —
// the store has no update path — and every envelope binds to the exact
// content hash it was created for.

export interface RetainerVersionRecord {
  id: string;
  jurisdiction: string;
  language: string;
  effectiveDate: string;
  /** RET-004: hash of the exact published content; immutable. */
  contentHash: string;
  storageKey: string;
  publishedAt: string;
  createdAt: string;
}

export interface RetainerVersionStore {
  insert(record: RetainerVersionRecord): Promise<void>;
  getById(id: string): Promise<RetainerVersionRecord | null>;
  /** Latest published version for a jurisdiction (by publishedAt). */
  getActive(jurisdiction: string): Promise<RetainerVersionRecord | null>;
}

export class InMemoryRetainerVersionStore implements RetainerVersionStore {
  private byId = new Map<string, RetainerVersionRecord>();

  async insert(record: RetainerVersionRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<RetainerVersionRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getActive(jurisdiction: string): Promise<RetainerVersionRecord | null> {
    const candidates = [...this.byId.values()]
      .filter((v) => v.jurisdiction === jurisdiction)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    return candidates[0] ? structuredClone(candidates[0]) : null;
  }
}

export interface RetainerSignatureRecord {
  id: string;
  intakeId: string;
  retainerVersionId: string;
  /** Bound content hash at envelope creation (RET-002). */
  contentHash: string;
  signerRef: string;
  providerEnvelopeId: string;
  signedAt: string | null;
  /** RET-003: provider evidence (envelope status, timestamps) as recorded. */
  evidence: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetainerSignatureStore {
  insert(record: RetainerSignatureRecord): Promise<void>;
  getByIntake(intakeId: string): Promise<RetainerSignatureRecord | null>;
  getByEnvelope(envelopeId: string): Promise<RetainerSignatureRecord | null>;
  update(record: RetainerSignatureRecord): Promise<void>;
}

export class InMemoryRetainerSignatureStore implements RetainerSignatureStore {
  private byId = new Map<string, RetainerSignatureRecord>();

  async insert(record: RetainerSignatureRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getByIntake(intakeId: string): Promise<RetainerSignatureRecord | null> {
    for (const record of this.byId.values()) {
      if (record.intakeId === intakeId) return structuredClone(record);
    }
    return null;
  }

  async getByEnvelope(envelopeId: string): Promise<RetainerSignatureRecord | null> {
    for (const record of this.byId.values()) {
      if (record.providerEnvelopeId === envelopeId) return structuredClone(record);
    }
    return null;
  }

  async update(record: RetainerSignatureRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

/** Structural adapter shape (SignatureAdapter). */
export interface SignatureProvider {
  createEnvelope(input: {
    idempotencyKey: string;
    retainerVersionId: string;
    retainerContentHash: string;
    signerEmail: string;
    signerName: string;
  }): Promise<{ envelopeId: string; signingUrl: string }>;
  getEnvelopeStatus(envelopeId: string): Promise<'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED'>;
}

const now = (): string => new Date().toISOString();

/** RET-001/RET-004: publishing is the only write; versions never change after. */
export async function publishRetainerVersion(
  store: RetainerVersionStore,
  input: { jurisdiction: string; language?: string; effectiveDate: string; contentHash: string; storageKey: string },
): Promise<RetainerVersionRecord> {
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new ServiceError(422, 'INVALID_HASH', 'contentHash must be a sha256 hex digest.');
  }
  const record: RetainerVersionRecord = {
    id: crypto.randomUUID(),
    jurisdiction: input.jurisdiction,
    language: input.language ?? 'en',
    effectiveDate: input.effectiveDate,
    contentHash: input.contentHash,
    storageKey: input.storageKey,
    publishedAt: now(),
    createdAt: now(),
  };
  await store.insert(record);
  return record;
}

/**
 * RET-002: an envelope binds the signer to the exact active version's content
 * hash. Idempotent per intake; a signature request against a superseded
 * version is rejected so no one signs stale terms.
 */
export async function requestRetainerSignature(
  stores: { versions: RetainerVersionStore; signatures: RetainerSignatureStore },
  provider: SignatureProvider,
  intake: IntakeRecord,
): Promise<{ record: RetainerSignatureRecord; signingUrl: string }> {
  const snapshot = intake.submittedSnapshot;
  if (!snapshot) {
    throw new ServiceError(409, 'NOT_SUBMITTED', 'The intake has not been submitted.');
  }
  const active = await stores.versions.getActive(intake.jurisdiction);
  if (!active) {
    throw new ServiceError(409, 'NO_RETAINER_VERSION', 'No published retainer version exists for this jurisdiction.');
  }
  const existing = await stores.signatures.getByIntake(intake.id);
  if (existing) {
    if (existing.retainerVersionId !== active.id && !existing.signedAt) {
      throw new ServiceError(409, 'VERSION_SUPERSEDED', 'The retainer changed; a new signature request is required.');
    }
    const envelope = await provider.createEnvelope({
      idempotencyKey: `retainer:${intake.id}:${existing.retainerVersionId}`,
      retainerVersionId: existing.retainerVersionId,
      retainerContentHash: existing.contentHash,
      signerEmail: snapshot.profile.email,
      signerName: `${snapshot.profile.firstName} ${snapshot.profile.lastName}`,
    });
    return { record: existing, signingUrl: envelope.signingUrl };
  }
  const envelope = await provider.createEnvelope({
    idempotencyKey: `retainer:${intake.id}:${active.id}`,
    retainerVersionId: active.id,
    retainerContentHash: active.contentHash,
    signerEmail: snapshot.profile.email,
    signerName: `${snapshot.profile.firstName} ${snapshot.profile.lastName}`,
  });
  const record: RetainerSignatureRecord = {
    id: crypto.randomUUID(),
    intakeId: intake.id,
    retainerVersionId: active.id,
    contentHash: active.contentHash,
    signerRef: intake.consumerKey,
    providerEnvelopeId: envelope.envelopeId,
    signedAt: null,
    evidence: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await stores.signatures.insert(record);
  return { record, signingUrl: envelope.signingUrl };
}

/**
 * RET-003/RET-005: poll the provider and record signature evidence exactly
 * once. Evidence is only recorded for a SIGNED envelope.
 */
export async function completeRetainerSignature(
  store: RetainerSignatureStore,
  provider: SignatureProvider,
  intakeId: string,
): Promise<RetainerSignatureRecord> {
  const record = await store.getByIntake(intakeId);
  if (!record) {
    throw new ServiceError(404, 'NOT_FOUND', 'No signature request exists for this intake.');
  }
  if (record.signedAt) return record;
  const status = await provider.getEnvelopeStatus(record.providerEnvelopeId);
  if (status !== 'SIGNED') {
    throw new ServiceError(409, 'NOT_SIGNED', 'The retainer has not been signed yet.');
  }
  record.signedAt = now();
  record.evidence = {
    envelopeId: record.providerEnvelopeId,
    envelopeStatus: status,
    contentHash: record.contentHash,
    recordedAt: record.signedAt,
  };
  record.updatedAt = record.signedAt;
  await store.update(record);
  return record;
}

/** RETAINER gate input for evaluateGates. */
export function retainerGateFromRecord(record: RetainerSignatureRecord | null): GateStatus {
  return record?.signedAt ? 'PASSED' : 'PENDING';
}
