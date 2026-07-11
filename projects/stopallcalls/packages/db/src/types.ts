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
  // Ownership handle for the consumer session cookie; never exposed in URLs.
  sessionToken: string;
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
  findActiveBySession(sessionToken: string): Promise<IntakeRecord | null>;
  /** Optimistic concurrency (API-002): returns false when the stored version differs. */
  update(record: IntakeRecord, expectedVersion: number): Promise<boolean>;
}
