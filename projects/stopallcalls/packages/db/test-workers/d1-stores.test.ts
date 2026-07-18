import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1AuthStore, D1EvidenceStore, D1IntakeStore } from '../src/d1';
import { createOrResumeIntake, saveProfile, submitIntake } from '../src/service';
import type { EvidenceRecord } from '../src/evidence';
import type { ConsumerProfile } from '@stopallcalls/contracts';

// Contract tests for the D1-backed stores against real D1 (miniflare SQLite)
// with the production migrations applied. Unique consumers per test keep the
// shared database independent between tests.

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

const consumer = () => `d1-${crypto.randomUUID()}@example.test`;

describe('D1IntakeStore', () => {
  it('round-trips an intake through the service layer', async () => {
    const store = new D1IntakeStore(env.DB);
    const key = consumer();
    const created = await createOrResumeIntake(store, key);
    const resumed = await createOrResumeIntake(store, key);
    expect(resumed.id).toBe(created.id);

    const withProfile = await saveProfile(store, key, created.id, PROFILE, created.version);
    expect(withProfile.version).toBe(created.version + 1);
    expect((await store.getById(created.id))?.profile?.email).toBe(PROFILE.email);
  });

  it('enforces optimistic concurrency in SQL', async () => {
    const store = new D1IntakeStore(env.DB);
    const key = consumer();
    const created = await createOrResumeIntake(store, key);
    expect(await store.update({ ...created }, created.version)).toBe(true);
    expect(await store.update({ ...created }, created.version)).toBe(false);
  });

  it('excludes CLOSED/CANCELLED and persists the submitted snapshot JSON', async () => {
    const store = new D1IntakeStore(env.DB);
    const key = consumer();
    let intake = await createOrResumeIntake(store, key);
    intake = await saveProfile(store, key, intake.id, PROFILE, intake.version);
    intake = {
      ...intake,
      agencies: [
        {
          id: crypto.randomUUID(),
          entry: { agencyName: 'ABC (Fictitious)', currency: 'CAD', contactChannels: ['PHONE'], allegations: [] },
        },
      ],
    };
    expect(await store.update(intake, intake.version)).toBe(true);
    const submitted = await submitIntake(
      store,
      key,
      intake.id,
      { isConsumer: true, contactConfirmed: true, informationTrue: true, authorizeLetter: true },
      intake.version + 1,
    );
    expect(submitted.state).toBe('SUBMITTED');
    const reloaded = await store.getById(intake.id);
    expect(reloaded?.submittedSnapshot?.agencies).toHaveLength(1);
    // SUBMITTED still counts as the consumer's active intake (dedupe).
    expect((await store.findActiveByConsumer(key))?.id).toBe(intake.id);
  });
});

describe('D1AuthStore', () => {
  it('stores challenges, returns the latest unconsumed, and tracks sessions', async () => {
    const store = new D1AuthStore(env.DB);
    const email = consumer();
    const base = {
      email,
      codeHash: 'a'.repeat(64),
      expiresAt: '2999-01-01T00:00:00.000Z',
      attempts: 0,
      consumedAt: null,
    };
    await store.insertChallenge({ ...base, id: 'ch-1-' + email, createdAt: '2026-07-16T00:00:00.000Z' });
    await store.insertChallenge({ ...base, id: 'ch-2-' + email, createdAt: '2026-07-16T01:00:00.000Z' });
    const latest = await store.getLatestChallenge(email);
    expect(latest?.id).toBe('ch-2-' + email);

    latest!.attempts = 3;
    latest!.consumedAt = '2026-07-16T02:00:00.000Z';
    await store.updateChallenge(latest!);
    expect((await store.getLatestChallenge(email))?.id).toBe('ch-1-' + email);

    const session = {
      token: crypto.randomUUID(),
      email,
      createdAt: '2026-07-16T02:00:00.000Z',
      expiresAt: '2999-01-01T00:00:00.000Z',
    };
    await store.insertSession(session);
    expect(await store.getSession(session.token)).toEqual(session);
    expect(await store.getSession('missing')).toBeNull();
  });
});

describe('D1EvidenceStore', () => {
  it('round-trips evidence with custody JSON and key lookup', async () => {
    const intakeStore = new D1IntakeStore(env.DB);
    const store = new D1EvidenceStore(env.DB);
    const key = consumer();
    const intake = await createOrResumeIntake(intakeStore, key);
    const record: EvidenceRecord = {
      id: crypto.randomUUID(),
      intakeId: intake.id,
      storageKey: `evidence/${intake.id}/${crypto.randomUUID()}.png`,
      category: 'SCREENSHOT',
      originalFilename: 'proof.png',
      mimeType: 'image/png',
      sizeBytes: 12,
      sha256: null,
      scanStatus: 'PENDING_UPLOAD',
      custody: [{ at: '2026-07-16T00:00:00.000Z', action: 'UPLOAD_REQUESTED' }],
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    };
    await store.insert(record);
    expect((await store.findByStorageKey(record.storageKey))?.id).toBe(record.id);

    record.sha256 = 'b'.repeat(64);
    record.scanStatus = 'CLEAN';
    record.custody.push({ at: '2026-07-16T00:01:00.000Z', action: 'SCAN_CLEAN' });
    await store.update(record);

    const listed = await store.listByIntake(intake.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.scanStatus).toBe('CLEAN');
    expect(listed[0]?.custody.map((c) => c.action)).toEqual(['UPLOAD_REQUESTED', 'SCAN_CLEAN']);
  });
});
