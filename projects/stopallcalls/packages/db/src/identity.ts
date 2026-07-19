import type { GateStatus } from '@stopallcalls/domain';
import type { IdentityWebhookEvent } from '@stopallcalls/contracts';
import { ServiceError } from './service';
import type { WebhookVerifier } from './payments';
import type { IntakeRecord } from './types';

// Phase 4 (IDV-001..005): provider-hosted identity verification — no local
// biometric templates, redacted match results only. Mismatches always route
// to human review; overrides are recorded with actor and reason.

export type IdentityRecordStatus =
  | 'PENDING'
  | 'VERIFIED'
  | 'MISMATCH_REVIEW'
  | 'OVERRIDDEN'
  | 'FAILED';

export interface IdentityRecord {
  id: string;
  intakeId: string;
  provider: string;
  providerRef: string;
  status: IdentityRecordStatus;
  /** IDV-002: redacted match results only — never raw documents/biometrics. */
  checks: Record<string, 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'> | null;
  processedEventIds: string[];
  overrideBy: string | null;
  overrideReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityStore {
  insert(record: IdentityRecord): Promise<void>;
  getById(id: string): Promise<IdentityRecord | null>;
  getByIntake(intakeId: string): Promise<IdentityRecord | null>;
  getByProviderRef(providerRef: string): Promise<IdentityRecord | null>;
  update(record: IdentityRecord): Promise<void>;
}

export class InMemoryIdentityStore implements IdentityStore {
  private byId = new Map<string, IdentityRecord>();

  async insert(record: IdentityRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<IdentityRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getByIntake(intakeId: string): Promise<IdentityRecord | null> {
    for (const record of this.byId.values()) {
      if (record.intakeId === intakeId) return structuredClone(record);
    }
    return null;
  }

  async getByProviderRef(providerRef: string): Promise<IdentityRecord | null> {
    for (const record of this.byId.values()) {
      if (record.providerRef === providerRef) return structuredClone(record);
    }
    return null;
  }

  async update(record: IdentityRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

/** Structural adapter shape (session portion of IdentityAdapter). */
export interface IdentitySessionProvider {
  createSession(input: {
    idempotencyKey: string;
    clientRef: string;
  }): Promise<{ providerRef: string; sessionUrl: string }>;
}

const now = (): string => new Date().toISOString();

/**
 * IDV-001: provider-hosted verification session. Idempotent per intake — an
 * existing record re-issues the same session rather than starting another.
 */
export async function startIdentityVerification(
  store: IdentityStore,
  provider: IdentitySessionProvider,
  intake: IntakeRecord,
): Promise<{ record: IdentityRecord; sessionUrl: string }> {
  if (!intake.submittedSnapshot) {
    throw new ServiceError(409, 'NOT_SUBMITTED', 'The intake has not been submitted.');
  }
  const session = await provider.createSession({
    idempotencyKey: `idv:${intake.id}`,
    // Provider correlation uses the opaque intake id, never PII.
    clientRef: intake.id,
  });
  const existing = await store.getByIntake(intake.id);
  if (existing) {
    // The provider may issue a DIFFERENT session than the one on record
    // (prior session hit a terminal state, adapter/config changed). Keep the
    // record pointed at the session the consumer will actually complete, or
    // its webhooks can never match (found in RAD-26 UAT: a fake-era record
    // swallowed a real didit approval). Settled outcomes are never reopened.
    const settled = existing.status === 'VERIFIED' || existing.status === 'OVERRIDDEN';
    if (!settled && existing.providerRef !== session.providerRef) {
      existing.providerRef = session.providerRef;
      existing.status = 'PENDING';
      existing.updatedAt = now();
      await store.update(existing);
    }
    return { record: existing, sessionUrl: session.sessionUrl };
  }
  const record: IdentityRecord = {
    id: crypto.randomUUID(),
    intakeId: intake.id,
    provider: 'hosted',
    providerRef: session.providerRef,
    status: 'PENDING',
    checks: null,
    processedEventIds: [],
    overrideBy: null,
    overrideReason: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await store.insert(record);
  return { record, sessionUrl: session.sessionUrl };
}

const WEBHOOK_TARGETS: Record<IdentityWebhookEvent['status'], IdentityRecordStatus | null> = {
  PENDING: null,
  VERIFIED: 'VERIFIED',
  // IDV-004: a mismatch never auto-fails — it routes to human review.
  MISMATCH: 'MISMATCH_REVIEW',
  FAILED: 'FAILED',
};

/** Terminal-by-human states a webhook must never overwrite. */
const HUMAN_OWNED: readonly IdentityRecordStatus[] = ['OVERRIDDEN'];

/**
 * IDV-003: signed, replay-protected, idempotent webhook application. The raw
 * payload is verified before any state change; seen eventIds are no-ops.
 */
export async function applyIdentityWebhook(
  store: IdentityStore,
  verifier: WebhookVerifier,
  rawPayload: string,
  signature: string,
  event: IdentityWebhookEvent,
): Promise<IdentityRecord> {
  if (!(await verifier.verifyWebhookSignature(rawPayload, signature))) {
    throw new ServiceError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
  }
  const record = await store.getByProviderRef(event.providerRef);
  if (!record) {
    throw new ServiceError(404, 'NOT_FOUND', 'No verification matches this provider reference.');
  }
  if (record.processedEventIds.includes(event.eventId)) {
    return record;
  }
  const target = WEBHOOK_TARGETS[event.status];
  if (target !== null && !HUMAN_OWNED.includes(record.status)) {
    record.status = target;
    if (event.checks) record.checks = event.checks;
  }
  record.processedEventIds = [...record.processedEventIds, event.eventId];
  record.updatedAt = now();
  await store.update(record);
  return record;
}

/**
 * IDV-005: audited manual override — human actor and reason are mandatory and
 * permanently recorded. Only reviews (mismatch/failed) can be overridden.
 */
export async function recordIdentityOverride(
  store: IdentityStore,
  recordId: string,
  input: { overriddenBy: string; reason: string },
): Promise<IdentityRecord> {
  if (!input.overriddenBy.trim()) {
    throw new ServiceError(422, 'ACTOR_REQUIRED', 'An overriding staff identifier is required.');
  }
  if (!input.reason.trim()) {
    throw new ServiceError(422, 'REASON_REQUIRED', 'A reason is required for identity overrides.');
  }
  const record = await store.getById(recordId);
  if (!record) {
    throw new ServiceError(404, 'NOT_FOUND', 'Verification record not found.');
  }
  if (record.status !== 'MISMATCH_REVIEW' && record.status !== 'FAILED') {
    throw new ServiceError(409, 'NOT_OVERRIDABLE', 'Only verifications in manual review can be overridden.');
  }
  record.status = 'OVERRIDDEN';
  record.overrideBy = input.overriddenBy.trim();
  record.overrideReason = input.reason.trim();
  record.updatedAt = now();
  await store.update(record);
  return record;
}

/** IDENTITY gate input for evaluateGates. */
export function identityGateFromRecord(record: IdentityRecord | null): GateStatus {
  if (!record) return 'PENDING';
  switch (record.status) {
    case 'VERIFIED':
    case 'OVERRIDDEN':
      return 'PASSED';
    case 'MISMATCH_REVIEW':
      return 'MANUAL_REVIEW';
    case 'FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}
