import { describe, expect, it } from 'vitest';
import type { AgencyEntry, Attestations, ConsumerProfile } from '@stopallcalls/contracts';
import {
  InMemoryIntakeStore,
  ServiceError,
  addAgency,
  createOrResumeIntake,
  removeAgency,
  saveProfile,
  submitIntake,
  toClientIntake,
} from '../src/index';

const PROFILE: ConsumerProfile = {
  firstName: 'Taylor',
  lastName: 'Testcase',
  dateOfBirth: '1985-06-15',
  email: 'taylor.testcase@example.test',
  phone: '+15555550100',
  address: {
    line1: '123 Fictional Avenue',
    city: 'Sampleville',
    region: 'ON',
    postalCode: 'A1A 1A1',
    country: 'CA',
  },
  preferredContactMethod: 'EMAIL',
};

const AGENCY: AgencyEntry = {
  agencyName: 'ABC Collections (Fictitious)',
  currency: 'CAD',
  contactChannels: ['PHONE'],
  allegations: [],
};

const ATTEST: Attestations = {
  isConsumer: true,
  contactConfirmed: true,
  informationTrue: true,
  authorizeLetter: true,
};

async function draftWithProfile(store: InMemoryIntakeStore, session = 'session-a') {
  const created = await createOrResumeIntake(store, session);
  return saveProfile(store, session, created.id, PROFILE, created.version);
}

describe('createOrResumeIntake', () => {
  it('is idempotent per session (INT-008 duplicate prevention)', async () => {
    const store = new InMemoryIntakeStore();
    const first = await createOrResumeIntake(store, 'session-a');
    const second = await createOrResumeIntake(store, 'session-a');
    expect(second.id).toBe(first.id);
  });

  it('isolates sessions from each other', async () => {
    const store = new InMemoryIntakeStore();
    const a = await createOrResumeIntake(store, 'session-a');
    const b = await createOrResumeIntake(store, 'session-b');
    expect(a.id).not.toBe(b.id);
  });
});

describe('ownership (IDOR)', () => {
  it('returns NOT_FOUND for another session, indistinguishable from missing', async () => {
    const store = new InMemoryIntakeStore();
    const a = await createOrResumeIntake(store, 'session-a');
    await expect(saveProfile(store, 'session-b', a.id, PROFILE, a.version)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
    await expect(saveProfile(store, 'session-b', 'no-such-id', PROFILE, 1)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('optimistic concurrency (API-002)', () => {
  it('rejects a stale version with 409', async () => {
    const store = new InMemoryIntakeStore();
    const intake = await draftWithProfile(store);
    await addAgency(store, 'session-a', intake.id, AGENCY, intake.version);
    await expect(addAgency(store, 'session-a', intake.id, AGENCY, intake.version)).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
    });
  });
});

describe('agencies (INT-004)', () => {
  it('adds and removes entries', async () => {
    const store = new InMemoryIntakeStore();
    let intake = await draftWithProfile(store);
    intake = await addAgency(store, 'session-a', intake.id, AGENCY, intake.version);
    expect(intake.agencies).toHaveLength(1);
    intake = await removeAgency(store, 'session-a', intake.id, intake.agencies[0]!.id, intake.version);
    expect(intake.agencies).toHaveLength(0);
  });

  it('enforces the configured maximum', async () => {
    const store = new InMemoryIntakeStore();
    let intake = await draftWithProfile(store);
    intake = await addAgency(store, 'session-a', intake.id, AGENCY, intake.version, 1);
    await expect(addAgency(store, 'session-a', intake.id, AGENCY, intake.version, 1)).rejects.toMatchObject({
      status: 422,
      code: 'AGENCY_LIMIT',
    });
  });
});

describe('submitIntake (INT-007, WF-001)', () => {
  it('freezes a snapshot and transitions DRAFT → SUBMITTED', async () => {
    const store = new InMemoryIntakeStore();
    let intake = await draftWithProfile(store);
    intake = await addAgency(store, 'session-a', intake.id, AGENCY, intake.version);
    const submitted = await submitIntake(store, 'session-a', intake.id, ATTEST, intake.version);
    expect(submitted.state).toBe('SUBMITTED');
    expect(submitted.submittedSnapshot?.profile.email).toBe(PROFILE.email);
    expect(submitted.submittedSnapshot?.agencies).toHaveLength(1);
  });

  it('blocks submission without a complete profile', async () => {
    const store = new InMemoryIntakeStore();
    const created = await createOrResumeIntake(store, 'session-a');
    const withAgency = await addAgency(store, 'session-a', created.id, AGENCY, created.version);
    await expect(submitIntake(store, 'session-a', created.id, ATTEST, withAgency.version)).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
    });
  });

  it('blocks submission without agencies', async () => {
    const store = new InMemoryIntakeStore();
    const intake = await draftWithProfile(store);
    await expect(submitIntake(store, 'session-a', intake.id, ATTEST, intake.version)).rejects.toMatchObject({
      code: 'NO_AGENCIES',
    });
  });

  it('rejects edits after submission (immutable snapshot)', async () => {
    const store = new InMemoryIntakeStore();
    let intake = await draftWithProfile(store);
    intake = await addAgency(store, 'session-a', intake.id, AGENCY, intake.version);
    const submitted = await submitIntake(store, 'session-a', intake.id, ATTEST, intake.version);
    await expect(addAgency(store, 'session-a', intake.id, AGENCY, submitted.version)).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });
    await expect(submitIntake(store, 'session-a', intake.id, ATTEST, submitted.version)).rejects.toMatchObject({
      code: 'NOT_EDITABLE',
    });
  });

  it('rejects incomplete attestations at the schema level', async () => {
    const store = new InMemoryIntakeStore();
    let intake = await draftWithProfile(store);
    intake = await addAgency(store, 'session-a', intake.id, AGENCY, intake.version);
    const partial = { ...ATTEST, authorizeLetter: false } as unknown as Attestations;
    await expect(submitIntake(store, 'session-a', intake.id, partial, intake.version)).rejects.toThrow();
  });
});

describe('toClientIntake', () => {
  it('never leaks the session token', async () => {
    const store = new InMemoryIntakeStore();
    const intake = await createOrResumeIntake(store, 'session-a');
    expect(Object.keys(toClientIntake(intake))).not.toContain('sessionToken');
  });
});

describe('ServiceError', () => {
  it('carries a safe machine-readable envelope (API-003)', () => {
    const err = new ServiceError(422, 'X', 'safe message');
    expect(err.status).toBe(422);
    expect(err.code).toBe('X');
  });
});
