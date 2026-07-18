import {
  DEFAULT_MAX_AGENCIES,
  agencyEntrySchema,
  attestationsSchema,
  consumerProfileSchema,
  type AgencyEntry,
  type Attestations,
  type ConsumerProfile,
} from '@stopallcalls/contracts';
import { canTransition } from '@stopallcalls/domain';
import type { IntakeRecord, IntakeStore, StoredAgency } from './types';

// API-003: services throw ServiceError; the HTTP layer maps it to the shared
// error envelope. Messages must stay safe for consumers (no internals/PII).
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

const now = (): string => new Date().toISOString();

// IDOR guard: a missing intake and someone else's intake are indistinguishable.
export async function getOwnedIntake(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
): Promise<IntakeRecord> {
  return getOwned(store, consumerKey, intakeId);
}

async function getOwned(store: IntakeStore, consumerKey: string, intakeId: string): Promise<IntakeRecord> {
  const record = await store.getById(intakeId);
  if (!record || record.consumerKey !== consumerKey) {
    throw new ServiceError(404, 'NOT_FOUND', 'Intake not found.');
  }
  return record;
}

function assertDraft(record: IntakeRecord): void {
  if (record.state !== 'DRAFT') {
    throw new ServiceError(409, 'NOT_EDITABLE', 'This intake has been submitted and can no longer be edited.');
  }
}

async function saveOrConflict(store: IntakeStore, record: IntakeRecord, expectedVersion: number): Promise<IntakeRecord> {
  record.updatedAt = now();
  const saved = await store.update(record, expectedVersion);
  if (!saved) {
    throw new ServiceError(409, 'VERSION_CONFLICT', 'The intake changed in another tab. Reload and try again.');
  }
  return { ...record, version: expectedVersion + 1 };
}

/** POST /api/intakes — naturally idempotent: one active intake per verified consumer (INT-008). */
export async function createOrResumeIntake(
  store: IntakeStore,
  consumerKey: string,
  jurisdiction = 'CA',
): Promise<IntakeRecord> {
  const existing = await store.findActiveByConsumer(consumerKey);
  if (existing) return existing;
  const record: IntakeRecord = {
    id: crypto.randomUUID(),
    consumerKey,
    jurisdiction,
    state: 'DRAFT',
    profile: null,
    agencies: [],
    submittedSnapshot: null,
    version: 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await store.insert(record);
  return record;
}

export async function saveProfile(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  profilePatch: Partial<ConsumerProfile>,
  expectedVersion: number,
): Promise<IntakeRecord> {
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);
  record.profile = { ...record.profile, ...profilePatch };
  return saveOrConflict(store, record, expectedVersion);
}

export async function addAgency(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  entry: AgencyEntry,
  expectedVersion: number,
  maxAgencies: number = DEFAULT_MAX_AGENCIES,
): Promise<IntakeRecord> {
  const parsed = agencyEntrySchema.parse(entry);
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);
  if (record.agencies.length >= maxAgencies) {
    throw new ServiceError(422, 'AGENCY_LIMIT', `A maximum of ${maxAgencies} collection agencies is supported per intake.`);
  }
  const agency: StoredAgency = { id: crypto.randomUUID(), entry: parsed };
  record.agencies = [...record.agencies, agency];
  return saveOrConflict(store, record, expectedVersion);
}

/** INT-004 edit: replaces the entry, keeping the stored agency id stable. */
export async function updateAgency(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  agencyId: string,
  entry: AgencyEntry,
  expectedVersion: number,
): Promise<IntakeRecord> {
  const parsed = agencyEntrySchema.parse(entry);
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);
  const target = record.agencies.find((a) => a.id === agencyId);
  if (!target) {
    throw new ServiceError(404, 'NOT_FOUND', 'Agency entry not found.');
  }
  record.agencies = record.agencies.map((a) => (a.id === agencyId ? { ...a, entry: parsed } : a));
  return saveOrConflict(store, record, expectedVersion);
}

/** INT-004 duplicate: copies an entry as a new independent agency row. */
export async function duplicateAgency(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  agencyId: string,
  expectedVersion: number,
  maxAgencies: number = DEFAULT_MAX_AGENCIES,
): Promise<IntakeRecord> {
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);
  const source = record.agencies.find((a) => a.id === agencyId);
  if (!source) {
    throw new ServiceError(404, 'NOT_FOUND', 'Agency entry not found.');
  }
  if (record.agencies.length >= maxAgencies) {
    throw new ServiceError(422, 'AGENCY_LIMIT', `A maximum of ${maxAgencies} collection agencies is supported per intake.`);
  }
  const copy: StoredAgency = { id: crypto.randomUUID(), entry: structuredClone(source.entry) };
  record.agencies = [...record.agencies, copy];
  return saveOrConflict(store, record, expectedVersion);
}

export async function removeAgency(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  agencyId: string,
  expectedVersion: number,
): Promise<IntakeRecord> {
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);
  const next = record.agencies.filter((a) => a.id !== agencyId);
  if (next.length === record.agencies.length) {
    throw new ServiceError(404, 'NOT_FOUND', 'Agency entry not found.');
  }
  record.agencies = next;
  return saveOrConflict(store, record, expectedVersion);
}

/**
 * POST /api/intakes/:id/submit — freezes the snapshot (INT-007) and requests
 * the DRAFT → SUBMITTED transition through the domain guard (WF-001).
 */
export async function submitIntake(
  store: IntakeStore,
  consumerKey: string,
  intakeId: string,
  attestations: Attestations,
  expectedVersion: number,
): Promise<IntakeRecord> {
  const parsedAttestations = attestationsSchema.parse(attestations);
  const record = await getOwned(store, consumerKey, intakeId);
  assertDraft(record);

  const profileResult = consumerProfileSchema.safeParse(record.profile);
  if (!profileResult.success) {
    throw new ServiceError(422, 'PROFILE_INCOMPLETE', 'Complete all required profile fields before submitting.');
  }
  if (record.agencies.length === 0) {
    throw new ServiceError(422, 'NO_AGENCIES', 'Add at least one collection agency before submitting.');
  }
  if (!canTransition(record.state, 'SUBMITTED')) {
    throw new ServiceError(409, 'INVALID_STATE', 'This intake cannot be submitted in its current state.');
  }

  record.submittedSnapshot = {
    submittedAt: now(),
    profile: profileResult.data,
    agencies: structuredClone(record.agencies),
    attestations: parsedAttestations,
  };
  record.state = 'SUBMITTED';
  return saveOrConflict(store, record, expectedVersion);
}

/** Strips ownership internals before anything crosses the HTTP boundary. */
export function toClientIntake(record: IntakeRecord): Omit<IntakeRecord, 'consumerKey'> {
  const { consumerKey: _consumerKey, ...client } = record;
  return client;
}
