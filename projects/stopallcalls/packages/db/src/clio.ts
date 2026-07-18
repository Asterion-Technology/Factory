import {
  buildConflictSearchPackage,
  canCreateMatters,
  canTransition,
  type ConflictSearchTerm,
  type GateSnapshot,
  type MatterState,
} from '@stopallcalls/domain';
import { ServiceError } from './service';
import type { IntakeRecord } from './types';

// Phase 3 (RAD-12): conflict check → human disposition → idempotent Clio
// provisioning. The Clio adapter is expressed structurally so this package
// depends only on contracts+domain; FakeClioAdapter (and later the real one)
// satisfies these shapes as-is.

export interface ClioContactHit {
  clioId: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface ConflictSearchClio {
  searchContacts(query: string): Promise<ClioContactHit[]>;
}

export interface ProvisioningClio extends ConflictSearchClio {
  createContact(input: {
    idempotencyKey: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }): Promise<ClioContactHit>;
  createMatter(input: {
    idempotencyKey: string;
    contactClioId: string;
    description: string;
  }): Promise<{ clioId: string; displayNumber: string }>;
}

export type ConflictDisposition = 'CLEAR' | 'POSSIBLE_CONFLICT' | 'CONFLICT_FOUND';

export interface ConflictCheckRecord {
  id: string;
  intakeId: string;
  terms: ConflictSearchTerm[];
  hits: { term: ConflictSearchTerm; contacts: ClioContactHit[] }[];
  // CLIO-003: null until an authorized human records a disposition.
  disposition: ConflictDisposition | null;
  reviewedBy: string | null;
  rationale: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ConflictCheckStore {
  insert(record: ConflictCheckRecord): Promise<void>;
  getById(id: string): Promise<ConflictCheckRecord | null>;
  getByIntake(intakeId: string): Promise<ConflictCheckRecord | null>;
  update(record: ConflictCheckRecord): Promise<void>;
}

export interface MatterRecord {
  id: string;
  intakeId: string;
  /** StoredAgency id within the submitted snapshot. */
  agencyId: string;
  clioMatterId: string;
  displayNumber: string;
  state: MatterState;
  createdAt: string;
  updatedAt: string;
}

export interface MatterStore {
  insert(record: MatterRecord): Promise<void>;
  getById(id: string): Promise<MatterRecord | null>;
  listByIntake(intakeId: string): Promise<MatterRecord[]>;
  /** State changes only — always guarded by canTransition (WF-001). */
  update(record: MatterRecord): Promise<void>;
}

/** WF-003/DATA-005: the idempotency ledger for external side effects. */
export interface ClioMappingStore {
  get(idempotencyKey: string): Promise<{ clioId: string; displayNumber?: string } | null>;
  insert(entry: { idempotencyKey: string; localEntity: string; localId: string; clioId: string; displayNumber?: string }): Promise<void>;
}

export class InMemoryConflictCheckStore implements ConflictCheckStore {
  private byId = new Map<string, ConflictCheckRecord>();

  async insert(record: ConflictCheckRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<ConflictCheckRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async getByIntake(intakeId: string): Promise<ConflictCheckRecord | null> {
    for (const record of this.byId.values()) {
      if (record.intakeId === intakeId) return structuredClone(record);
    }
    return null;
  }

  async update(record: ConflictCheckRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

export class InMemoryMatterStore implements MatterStore {
  private byId = new Map<string, MatterRecord>();

  async insert(record: MatterRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }

  async getById(id: string): Promise<MatterRecord | null> {
    const record = this.byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async listByIntake(intakeId: string): Promise<MatterRecord[]> {
    return [...this.byId.values()]
      .filter((m) => m.intakeId === intakeId)
      .map((m) => structuredClone(m));
  }

  async update(record: MatterRecord): Promise<void> {
    this.byId.set(record.id, structuredClone(record));
  }
}

export class InMemoryClioMappingStore implements ClioMappingStore {
  private byKey = new Map<string, { clioId: string; displayNumber?: string }>();

  async get(key: string): Promise<{ clioId: string; displayNumber?: string } | null> {
    return this.byKey.get(key) ?? null;
  }

  async insert(entry: {
    idempotencyKey: string;
    localEntity: string;
    localId: string;
    clioId: string;
    displayNumber?: string;
  }): Promise<void> {
    this.byKey.set(entry.idempotencyKey, {
      clioId: entry.clioId,
      ...(entry.displayNumber ? { displayNumber: entry.displayNumber } : {}),
    });
  }
}

const now = (): string => new Date().toISOString();

function requireSnapshot(intake: IntakeRecord) {
  if (!intake.submittedSnapshot) {
    throw new ServiceError(409, 'NOT_SUBMITTED', 'The intake has not been submitted.');
  }
  return intake.submittedSnapshot;
}

/**
 * Builds the search package from the immutable snapshot and runs every term
 * against Clio. Idempotent per intake: an existing check is returned as-is so
 * a re-run never discards a recorded disposition.
 */
export async function runConflictCheck(
  store: ConflictCheckStore,
  clio: ConflictSearchClio,
  intake: IntakeRecord,
): Promise<ConflictCheckRecord> {
  const existing = await store.getByIntake(intake.id);
  if (existing) return existing;
  const snapshot = requireSnapshot(intake);
  const terms = buildConflictSearchPackage({
    firstName: snapshot.profile.firstName,
    lastName: snapshot.profile.lastName,
    email: snapshot.profile.email,
    phone: snapshot.profile.phone,
    agencies: snapshot.agencies.map((a) => ({
      agencyName: a.entry.agencyName,
      originalCreditor: a.entry.originalCreditor,
      debtBuyer: a.entry.debtBuyer,
    })),
  });
  const hits: ConflictCheckRecord['hits'] = [];
  for (const term of terms) {
    const contacts = await clio.searchContacts(term.value);
    if (contacts.length > 0) hits.push({ term, contacts });
  }
  const record: ConflictCheckRecord = {
    id: crypto.randomUUID(),
    intakeId: intake.id,
    terms,
    hits,
    disposition: null,
    reviewedBy: null,
    rationale: null,
    reviewedAt: null,
    createdAt: now(),
  };
  await store.insert(record);
  return record;
}

/**
 * CLIO-003: only an authorized human records a disposition, exactly once.
 * The caller is responsible for staff authentication; this layer enforces
 * that an actor and rationale are always present and recorded.
 */
export async function recordConflictDisposition(
  store: ConflictCheckStore,
  checkId: string,
  input: { disposition: ConflictDisposition; reviewedBy: string; rationale: string },
): Promise<ConflictCheckRecord> {
  if (!input.reviewedBy.trim()) {
    throw new ServiceError(422, 'REVIEWER_REQUIRED', 'A human reviewer is required for conflict dispositions.');
  }
  if (!input.rationale.trim()) {
    throw new ServiceError(422, 'RATIONALE_REQUIRED', 'A rationale is required for conflict dispositions.');
  }
  const record = await store.getById(checkId);
  if (!record) {
    throw new ServiceError(404, 'NOT_FOUND', 'Conflict check not found.');
  }
  if (record.disposition !== null) {
    throw new ServiceError(409, 'ALREADY_DECIDED', 'This conflict check already has a disposition.');
  }
  record.disposition = input.disposition;
  record.reviewedBy = input.reviewedBy.trim();
  record.rationale = input.rationale.trim();
  record.reviewedAt = now();
  await store.update(record);
  return record;
}

export interface ProvisioningStores {
  conflicts: ConflictCheckStore;
  matters: MatterStore;
  mappings: ClioMappingStore;
}

/**
 * CLIO-004..006 / WF-003/004 / WF-006: one Clio contact per consumer
 * (search-before-create) and one matter per agency, gated on every
 * matter-creation gate having passed AND a human-recorded CLEAR disposition.
 * Every external call goes through the idempotency ledger first, so retries
 * after partial failure never duplicate contacts or matters.
 */
export async function provisionClioForIntake(
  stores: ProvisioningStores,
  clio: ProvisioningClio,
  intake: IntakeRecord,
  gates: GateSnapshot,
): Promise<{ contactClioId: string; matters: MatterRecord[] }> {
  if (!canCreateMatters(gates)) {
    throw new ServiceError(409, 'GATES_NOT_PASSED', 'Matter creation requires all pre-creation gates to have passed.');
  }
  const check = await stores.conflicts.getByIntake(intake.id);
  // WF-006: conflict-blocked (or undecided) intakes create no Clio records.
  if (check?.disposition !== 'CLEAR') {
    throw new ServiceError(409, 'CONFLICT_NOT_CLEAR', 'A human-recorded CLEAR conflict disposition is required.');
  }
  const snapshot = requireSnapshot(intake);
  const profile = snapshot.profile;

  const contactKey = `clio-contact:${intake.id}`;
  let contactClioId = (await stores.mappings.get(contactKey))?.clioId;
  if (!contactClioId) {
    // CLIO-004: search before create — an exact email match is the same person.
    const matches = await clio.searchContacts(profile.email);
    const existing = matches.find((c) => c.email?.toLowerCase() === profile.email.toLowerCase());
    const contact =
      existing ??
      (await clio.createContact({
        idempotencyKey: contactKey,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phone: profile.phone,
      }));
    contactClioId = contact.clioId;
    await stores.mappings.insert({
      idempotencyKey: contactKey,
      localEntity: 'intake-contact',
      localId: intake.id,
      clioId: contactClioId,
    });
  }

  const existingMatters = new Map((await stores.matters.listByIntake(intake.id)).map((m) => [m.agencyId, m]));
  const matters: MatterRecord[] = [];
  for (const agency of snapshot.agencies) {
    const already = existingMatters.get(agency.id);
    if (already) {
      matters.push(already);
      continue;
    }
    const matterKey = `clio-matter:${intake.id}:${agency.id}`;
    let mapped = await stores.mappings.get(matterKey);
    if (!mapped) {
      const created = await clio.createMatter({
        idempotencyKey: matterKey,
        contactClioId,
        // CLIO-006: "[Last], [First] v. [Collection Agency]"
        description: `${profile.lastName}, ${profile.firstName} v. ${agency.entry.agencyName}`,
      });
      mapped = { clioId: created.clioId, displayNumber: created.displayNumber };
      await stores.mappings.insert({
        idempotencyKey: matterKey,
        localEntity: 'matter',
        localId: agency.id,
        clioId: created.clioId,
        displayNumber: created.displayNumber,
      });
    }
    const initial: MatterState = 'MATTER_PENDING';
    if (!canTransition(initial, 'MATTER_CREATED')) {
      throw new ServiceError(500, 'INTERNAL', 'Matter state machine rejected creation.');
    }
    const record: MatterRecord = {
      id: crypto.randomUUID(),
      intakeId: intake.id,
      agencyId: agency.id,
      clioMatterId: mapped.clioId,
      displayNumber: mapped.displayNumber ?? '',
      state: 'MATTER_CREATED',
      createdAt: now(),
      updatedAt: now(),
    };
    await stores.matters.insert(record);
    matters.push(record);
  }
  return { contactClioId, matters };
}
