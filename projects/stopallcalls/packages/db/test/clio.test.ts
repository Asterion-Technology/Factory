import { describe, expect, it } from 'vitest';
import type { GateSnapshot } from '@stopallcalls/domain';
import {
  InMemoryClioMappingStore,
  InMemoryConflictCheckStore,
  InMemoryIntakeStore,
  InMemoryMatterStore,
  addAgency,
  createOrResumeIntake,
  provisionClioForIntake,
  recordConflictDisposition,
  runConflictCheck,
  saveProfile,
  submitIntake,
  type IntakeRecord,
  type ProvisioningClio,
} from '../src/index';

const CONSUMER = 'taylor.testcase@example.test';

const PROFILE = {
  firstName: 'Taylor',
  lastName: 'Testcase',
  dateOfBirth: '1985-06-15',
  email: CONSUMER,
  phone: '+15555550100',
  address: {
    line1: '123 Fictional Avenue',
    city: 'Sampleville',
    region: 'ON',
    postalCode: 'A1A 1A1',
    country: 'CA',
  },
  preferredContactMethod: 'EMAIL' as const,
};

const AGENCY = (name: string) => ({
  agencyName: name,
  currency: 'CAD',
  contactChannels: ['PHONE' as const],
  allegations: [],
});

const ATTEST = { isConsumer: true, contactConfirmed: true, informationTrue: true, authorizeLetter: true } as const;

const gates = (status: 'PASSED' | 'PENDING'): GateSnapshot =>
  Object.fromEntries(
    ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT', 'LEGAL_APPROVAL'].map((gate) => [
      gate,
      { gate, status: gate === 'LEGAL_APPROVAL' ? 'PENDING' : status },
    ]),
  ) as unknown as GateSnapshot;

// Deterministic fake Clio with injectable failure for retry tests (WF-004).
class TestClio implements ProvisioningClio {
  contacts = new Map<string, { clioId: string; name: string; email?: string; phone?: string }>();
  mattersByKey = new Map<string, { clioId: string; displayNumber: string }>();
  descriptions: string[] = [];
  failNextCreateMatter = false;
  private seq = 0;

  async searchContacts(query: string) {
    const q = query.toLowerCase();
    return [...this.contacts.values()].filter(
      (c) => c.name.toLowerCase().includes(q) || c.email?.toLowerCase() === q,
    );
  }

  async createContact(input: { idempotencyKey: string; firstName: string; lastName: string; email: string; phone: string }) {
    const existing = this.contacts.get(input.idempotencyKey);
    if (existing) return existing;
    const contact = {
      clioId: `contact-${++this.seq}`,
      name: `${input.firstName} ${input.lastName}`,
      email: input.email,
      phone: input.phone,
    };
    this.contacts.set(input.idempotencyKey, contact);
    return contact;
  }

  async createMatter(input: { idempotencyKey: string; contactClioId: string; description: string }) {
    if (this.failNextCreateMatter) {
      this.failNextCreateMatter = false;
      throw new Error('simulated Clio outage');
    }
    const existing = this.mattersByKey.get(input.idempotencyKey);
    if (existing) return existing;
    this.descriptions.push(input.description);
    const matter = { clioId: `matter-${++this.seq}`, displayNumber: `FAKE-${this.seq}` };
    this.mattersByKey.set(input.idempotencyKey, matter);
    return matter;
  }
}

async function submittedIntake(agencies: string[]): Promise<IntakeRecord> {
  const store = new InMemoryIntakeStore();
  let intake = await createOrResumeIntake(store, CONSUMER);
  intake = await saveProfile(store, CONSUMER, intake.id, PROFILE, intake.version);
  for (const name of agencies) {
    intake = await addAgency(store, CONSUMER, intake.id, AGENCY(name), intake.version);
  }
  return submitIntake(store, CONSUMER, intake.id, ATTEST, intake.version);
}

function harness() {
  return {
    conflicts: new InMemoryConflictCheckStore(),
    matters: new InMemoryMatterStore(),
    mappings: new InMemoryClioMappingStore(),
    clio: new TestClio(),
  };
}

describe('runConflictCheck (CLIO-002)', () => {
  it('builds terms from the snapshot and aggregates hits', async () => {
    const h = harness();
    h.clio.contacts.set('seed', { clioId: 'existing-1', name: 'ABC Collections (Fictitious)' });
    const intake = await submittedIntake(['ABC Collections (Fictitious)']);
    const check = await runConflictCheck(h.conflicts, h.clio, intake);
    expect(check.terms.map((t) => t.type)).toEqual(
      expect.arrayContaining(['CONSUMER_NAME', 'EMAIL', 'PHONE', 'AGENCY']),
    );
    expect(check.hits).toHaveLength(1);
    expect(check.hits[0]!.contacts[0]!.clioId).toBe('existing-1');
  });

  it('is idempotent per intake and never discards a disposition', async () => {
    const h = harness();
    const intake = await submittedIntake(['ABC Collections (Fictitious)']);
    const first = await runConflictCheck(h.conflicts, h.clio, intake);
    await recordConflictDisposition(h.conflicts, first.id, {
      disposition: 'CLEAR',
      reviewedBy: 'staff-1',
      rationale: 'No prior relationship found.',
    });
    const second = await runConflictCheck(h.conflicts, h.clio, intake);
    expect(second.id).toBe(first.id);
    expect(second.disposition).toBe('CLEAR');
  });

  it('refuses unsubmitted intakes', async () => {
    const h = harness();
    const store = new InMemoryIntakeStore();
    const draft = await createOrResumeIntake(store, CONSUMER);
    await expect(runConflictCheck(h.conflicts, h.clio, draft)).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });
});

describe('recordConflictDisposition (CLIO-003, human-only)', () => {
  it('requires a reviewer and a rationale, and decides exactly once', async () => {
    const h = harness();
    const intake = await submittedIntake(['ABC Collections (Fictitious)']);
    const check = await runConflictCheck(h.conflicts, h.clio, intake);
    await expect(
      recordConflictDisposition(h.conflicts, check.id, { disposition: 'CLEAR', reviewedBy: ' ', rationale: 'x' }),
    ).rejects.toMatchObject({ code: 'REVIEWER_REQUIRED' });
    await expect(
      recordConflictDisposition(h.conflicts, check.id, { disposition: 'CLEAR', reviewedBy: 'staff-1', rationale: '' }),
    ).rejects.toMatchObject({ code: 'RATIONALE_REQUIRED' });
    const decided = await recordConflictDisposition(h.conflicts, check.id, {
      disposition: 'POSSIBLE_CONFLICT',
      reviewedBy: 'staff-1',
      rationale: 'Name similarity with an existing contact.',
    });
    expect(decided.reviewedAt).toBeTruthy();
    await expect(
      recordConflictDisposition(h.conflicts, check.id, { disposition: 'CLEAR', reviewedBy: 'staff-2', rationale: 'y' }),
    ).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });
});

describe('provisionClioForIntake (CLIO-004..006, WF-003/004/006)', () => {
  async function clearedIntake(h: ReturnType<typeof harness>, agencies: string[]) {
    const intake = await submittedIntake(agencies);
    const check = await runConflictCheck(h.conflicts, h.clio, intake);
    await recordConflictDisposition(h.conflicts, check.id, {
      disposition: 'CLEAR',
      reviewedBy: 'staff-1',
      rationale: 'No prior relationship found.',
    });
    return intake;
  }

  it('blocks when gates have not passed (PAY-006)', async () => {
    const h = harness();
    const intake = await clearedIntake(h, ['ABC Collections (Fictitious)']);
    await expect(provisionClioForIntake(h, h.clio, intake, gates('PENDING'))).rejects.toMatchObject({
      code: 'GATES_NOT_PASSED',
    });
  });

  it('blocks without a human CLEAR disposition and creates nothing (WF-006)', async () => {
    const h = harness();
    const intake = await submittedIntake(['ABC Collections (Fictitious)']);
    const check = await runConflictCheck(h.conflicts, h.clio, intake);
    await recordConflictDisposition(h.conflicts, check.id, {
      disposition: 'CONFLICT_FOUND',
      reviewedBy: 'staff-1',
      rationale: 'Existing client on the other side.',
    });
    await expect(provisionClioForIntake(h, h.clio, intake, gates('PASSED'))).rejects.toMatchObject({
      code: 'CONFLICT_NOT_CLEAR',
    });
    expect(await h.matters.listByIntake(intake.id)).toHaveLength(0);
    expect(h.clio.contacts.size).toBe(0);
  });

  it('creates one contact and one matter per agency with CLIO-006 naming', async () => {
    const h = harness();
    const intake = await clearedIntake(h, ['ABC Collections (Fictitious)', 'XYZ Recovery (Fictitious)']);
    const result = await provisionClioForIntake(h, h.clio, intake, gates('PASSED'));
    expect(result.matters).toHaveLength(2);
    expect(h.clio.descriptions).toContain('Testcase, Taylor v. ABC Collections (Fictitious)');
    expect(h.clio.descriptions).toContain('Testcase, Taylor v. XYZ Recovery (Fictitious)');
    expect(result.matters.every((m) => m.state === 'MATTER_CREATED')).toBe(true);
  });

  it('reuses an existing Clio contact on exact email match (CLIO-004)', async () => {
    const h = harness();
    h.clio.contacts.set('pre', { clioId: 'pre-existing', name: 'Taylor Testcase', email: CONSUMER });
    const intake = await clearedIntake(h, ['ABC Collections (Fictitious)']);
    const result = await provisionClioForIntake(h, h.clio, intake, gates('PASSED'));
    expect(result.contactClioId).toBe('pre-existing');
    expect(h.clio.contacts.size).toBe(1);
  });

  it('EXIT CRITERION: full retry creates no duplicate contacts or matters', async () => {
    const h = harness();
    const intake = await clearedIntake(h, ['ABC Collections (Fictitious)', 'XYZ Recovery (Fictitious)']);
    const first = await provisionClioForIntake(h, h.clio, intake, gates('PASSED'));
    const second = await provisionClioForIntake(h, h.clio, intake, gates('PASSED'));
    expect(second.contactClioId).toBe(first.contactClioId);
    expect(second.matters.map((m) => m.clioMatterId).sort()).toEqual(first.matters.map((m) => m.clioMatterId).sort());
    expect(await h.matters.listByIntake(intake.id)).toHaveLength(2);
    expect(h.clio.contacts.size).toBe(1);
    expect(h.clio.mattersByKey.size).toBe(2);
  });

  it('EXIT CRITERION: retry after mid-provisioning failure completes without duplicates', async () => {
    const h = harness();
    const intake = await clearedIntake(h, ['ABC Collections (Fictitious)', 'XYZ Recovery (Fictitious)']);
    h.clio.failNextCreateMatter = true;
    await expect(provisionClioForIntake(h, h.clio, intake, gates('PASSED'))).rejects.toThrow('simulated Clio outage');
    // Partial state: contact exists, at most one matter landed. Retry heals.
    const result = await provisionClioForIntake(h, h.clio, intake, gates('PASSED'));
    expect(result.matters).toHaveLength(2);
    expect(await h.matters.listByIntake(intake.id)).toHaveLength(2);
    expect(h.clio.contacts.size).toBe(1);
    expect(h.clio.mattersByKey.size).toBe(2);
    expect(h.clio.descriptions).toHaveLength(2);
  });
});
