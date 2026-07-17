import type { AgencyEntry, Attestations, ConsumerProfile } from '@stopallcalls/contracts';
import type { IntakeState } from '@stopallcalls/domain';

export interface StoredAgency {
  id: string;
  entry: AgencyEntry;
}

// INT-007: the submitted snapshot is immutable; later changes become versioned
// amendments (not yet implemented — Phase 1 scope note in BUILD_PLAN).
export interface SubmittedSnapshot {
  submittedAt: string;
  profile: ConsumerProfile;
  agencies: StoredAgency[];
  attestations: Attestations;
}

export interface IntakeRecord {
  id: string;
  // INT-002: ownership handle — the verified consumer's normalized email,
  // resolved server-side from the session cookie. Never exposed in URLs or
  // client payloads; also what makes one intake per consumer hold across
  // devices (INT-008 duplicate prevention).
  consumerKey: string;
  jurisdiction: string;
  state: IntakeState;
  profile: Partial<ConsumerProfile> | null;
  agencies: StoredAgency[];
  submittedSnapshot: SubmittedSnapshot | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeStore {
  insert(record: IntakeRecord): Promise<void>;
  getById(id: string): Promise<IntakeRecord | null>;
  findActiveByConsumer(consumerKey: string): Promise<IntakeRecord | null>;
  /** Optimistic concurrency (API-002): returns false when the stored version differs. */
  update(record: IntakeRecord, expectedVersion: number): Promise<boolean>;
}
