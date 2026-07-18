import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  D1AuthStore,
  D1ClioMappingStore,
  D1ConflictCheckStore,
  D1EvidenceStore,
  D1IntakeStore,
  D1MatterStore,
} from '../src/d1';
import {
  D1IdentityStore,
  D1OrderStore,
  D1PaymentStore,
  D1RetainerSignatureStore,
  D1RetainerVersionStore,
} from '../src/d1-phase4';
import { provisionClioForIntake, recordConflictDisposition, runConflictCheck, type ProvisioningClio } from '../src/clio';
import { createOrderForIntake } from '../src/orders';
import { applyPaymentWebhook, confirmEmtPayment, startEmtPayment, startHostedPayment } from '../src/payments';
import { applyIdentityWebhook, recordIdentityOverride, startIdentityVerification } from '../src/identity';
import {
  completeRetainerSignature,
  publishRetainerVersion,
  requestRetainerSignature,
} from '../src/retainer';
import { FakeIdentityAdapter, FakePaymentAdapter, FakeSignatureAdapter } from '@stopallcalls/integrations';
import type { PricingConfig } from '@stopallcalls/domain';
import { addAgency, createOrResumeIntake, saveProfile, submitIntake } from '../src/service';
import type { EvidenceRecord } from '../src/evidence';
import type { IntakeRecord } from '../src/types';
import type { ConsumerProfile } from '@stopallcalls/contracts';
import type { GateSnapshot } from '@stopallcalls/domain';

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

const ALL_PASSED: GateSnapshot = Object.fromEntries(
  ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT', 'LEGAL_APPROVAL'].map((gate) => [
    gate,
    { gate, status: 'PASSED' },
  ]),
) as unknown as GateSnapshot;

// Deterministic fake Clio with injectable failure, mirroring test/clio.test.ts.
class TestClio implements ProvisioningClio {
  contacts = new Map<string, { clioId: string; name: string; email?: string; phone?: string }>();
  mattersByKey = new Map<string, { clioId: string; displayNumber: string }>();
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
    const matter = { clioId: `matter-${++this.seq}`, displayNumber: `FAKE-${this.seq}` };
    this.mattersByKey.set(input.idempotencyKey, matter);
    return matter;
  }
}

async function submittedD1Intake(agencies: string[]): Promise<IntakeRecord> {
  const store = new D1IntakeStore(env.DB);
  const key = consumer();
  let intake = await createOrResumeIntake(store, key);
  intake = await saveProfile(store, key, intake.id, { ...PROFILE, email: key }, intake.version);
  for (const name of agencies) {
    intake = await addAgency(
      store,
      key,
      intake.id,
      { agencyName: name, currency: 'CAD', contactChannels: ['PHONE'], allegations: [] },
      intake.version,
    );
  }
  return submitIntake(
    store,
    key,
    intake.id,
    { isConsumer: true, contactConfirmed: true, informationTrue: true, authorizeLetter: true },
    intake.version,
  );
}

describe('D1 Clio stores (RAD-5 exit criterion)', () => {
  const stores = () => ({
    conflicts: new D1ConflictCheckStore(env.DB),
    matters: new D1MatterStore(env.DB),
    mappings: new D1ClioMappingStore(env.DB),
  });

  it('round-trips a conflict check and its one-time disposition', async () => {
    const s = stores();
    const clio = new TestClio();
    clio.contacts.set('seed', { clioId: 'existing-1', name: 'ABC Collections (Fictitious)' });
    const intake = await submittedD1Intake(['ABC Collections (Fictitious)']);

    const check = await runConflictCheck(s.conflicts, clio, intake);
    expect(check.hits).toHaveLength(1);
    // Idempotent per intake, straight from SQL.
    expect((await runConflictCheck(s.conflicts, clio, intake)).id).toBe(check.id);

    await recordConflictDisposition(s.conflicts, check.id, {
      disposition: 'CLEAR',
      reviewedBy: 'staff-1',
      rationale: 'No prior relationship found.',
    });
    const reloaded = await s.conflicts.getByIntake(intake.id);
    expect(reloaded?.disposition).toBe('CLEAR');
    expect(reloaded?.reviewedBy).toBe('staff-1');
    await expect(
      recordConflictDisposition(s.conflicts, check.id, { disposition: 'CLEAR', reviewedBy: 'staff-2', rationale: 'x' }),
    ).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });

  it('EXIT CRITERION: retries against D1 create no duplicate contacts or matters', async () => {
    const s = stores();
    const clio = new TestClio();
    const intake = await submittedD1Intake(['ABC Collections (Fictitious)', 'XYZ Recovery (Fictitious)']);
    const check = await runConflictCheck(s.conflicts, clio, intake);
    await recordConflictDisposition(s.conflicts, check.id, {
      disposition: 'CLEAR',
      reviewedBy: 'staff-1',
      rationale: 'No prior relationship found.',
    });

    // Mid-provisioning failure, then heal on retry (WF-004).
    clio.failNextCreateMatter = true;
    await expect(provisionClioForIntake(s, clio, intake, ALL_PASSED)).rejects.toThrow('simulated Clio outage');
    const first = await provisionClioForIntake(s, clio, intake, ALL_PASSED);
    const second = await provisionClioForIntake(s, clio, intake, ALL_PASSED);

    expect(first.matters).toHaveLength(2);
    expect(second.contactClioId).toBe(first.contactClioId);
    expect(second.matters.map((m) => m.clioMatterId).sort()).toEqual(first.matters.map((m) => m.clioMatterId).sort());
    expect(await s.matters.listByIntake(intake.id)).toHaveLength(2);
    expect(clio.contacts.size).toBe(1);
    expect(clio.mattersByKey.size).toBe(2);

    // Persisted rows carry the ledger's display numbers.
    const persisted = await s.matters.listByIntake(intake.id);
    expect(persisted.every((m) => m.displayNumber.startsWith('FAKE-'))).toBe(true);
    expect(persisted.every((m) => m.state === 'MATTER_CREATED')).toBe(true);
  });

  it('ledger insert is first-write-wins for a duplicate idempotency key', async () => {
    const mappings = new D1ClioMappingStore(env.DB);
    const key = `test-key-${crypto.randomUUID()}`;
    await mappings.insert({ idempotencyKey: key, localEntity: 'matter', localId: 'a-1', clioId: 'clio-1', displayNumber: 'N-1' });
    await mappings.insert({ idempotencyKey: key, localEntity: 'matter', localId: 'a-1', clioId: 'clio-2', displayNumber: 'N-2' });
    expect(await mappings.get(key)).toEqual({ clioId: 'clio-1', displayNumber: 'N-1' });
  });
});

const PRICING: PricingConfig = { baseFeeCents: 9900, perAgencyFeeCents: 2500, taxRateBps: 1300, currency: 'CAD' };
const SIG = 'fake-valid-signature';

describe('D1 Phase 4 stores (RAD-13)', () => {
  it('orders: idempotent per intake, UNIQUE(intake_id) enforced in SQL', async () => {
    const orders = new D1OrderStore(env.DB);
    const intake = await submittedD1Intake(['A (Fictitious)', 'B (Fictitious)']);
    const order = await createOrderForIntake(orders, PRICING, intake);
    expect((await createOrderForIntake(orders, PRICING, intake)).id).toBe(order.id);
    await expect(
      orders.insert({ ...order, id: crypto.randomUUID() }),
    ).rejects.toThrow(/UNIQUE/i);
    expect((await orders.getByIntake(intake.id))?.pricing.items).toHaveLength(3);
  });

  it('payments: EXIT CRITERION webhook replay applies exactly once against D1', async () => {
    const orders = new D1OrderStore(env.DB);
    const payments = new D1PaymentStore(env.DB);
    const adapter = new FakePaymentAdapter();
    const intake = await submittedD1Intake(['A (Fictitious)']);
    const order = await createOrderForIntake(orders, PRICING, intake);
    const { payment } = await startHostedPayment(payments, adapter, order, 'CARD');

    const evt = { eventId: 'd1-evt-1', providerRef: payment.providerRef!, status: 'AUTHORIZED' as const };
    const raw = JSON.stringify(evt);
    expect((await applyPaymentWebhook(payments, adapter, raw, SIG, evt)).state).toBe('AUTHORIZED');
    const replay = await applyPaymentWebhook(payments, adapter, raw, SIG, evt);
    expect(replay.state).toBe('AUTHORIZED');
    expect(replay.processedEventIds).toEqual(['d1-evt-1']);
    const reloaded = await payments.getByProviderRef(payment.providerRef!);
    expect(reloaded?.processedEventIds).toEqual(['d1-evt-1']);
  });

  it('payments: EMT confirmation persists actor and state', async () => {
    const orders = new D1OrderStore(env.DB);
    const payments = new D1PaymentStore(env.DB);
    const intake = await submittedD1Intake(['A (Fictitious)']);
    const order = await createOrderForIntake(orders, PRICING, intake);
    const payment = await startEmtPayment(payments, order);
    await confirmEmtPayment(payments, payment.id, { id: 'billing-1', role: 'BILLING' });
    const reloaded = await payments.getById(payment.id);
    expect(reloaded?.state).toBe('EMT_CONFIRMED');
    expect(reloaded?.emtConfirmedBy).toBe('billing-1');
  });

  it('identity: webhook + audited override round-trip through D1', async () => {
    const store = new D1IdentityStore(env.DB);
    const adapter = new FakeIdentityAdapter();
    const intake = await submittedD1Intake(['A (Fictitious)']);
    const { record } = await startIdentityVerification(store, adapter, intake);
    const evt = {
      eventId: 'd1-idv-1',
      providerRef: record.providerRef,
      status: 'MISMATCH' as const,
      checks: { name: 'MISMATCH' as const },
    };
    await applyIdentityWebhook(store, adapter, JSON.stringify(evt), SIG, evt);
    const overridden = await recordIdentityOverride(store, record.id, {
      overriddenBy: 'staff-1',
      reason: 'Manually reviewed; alias confirmed.',
    });
    expect(overridden.status).toBe('OVERRIDDEN');
    const reloaded = await store.getByIntake(intake.id);
    expect(reloaded?.overrideBy).toBe('staff-1');
    expect(reloaded?.checks).toEqual({ name: 'MISMATCH' });
    expect(reloaded?.processedEventIds).toEqual(['d1-idv-1']);
  });

  it('retainer: publish → request → sign → evidence persists in D1', async () => {
    const versions = new D1RetainerVersionStore(env.DB);
    const signatures = new D1RetainerSignatureStore(env.DB);
    const adapter = new FakeSignatureAdapter();
    const intake = await submittedD1Intake(['A (Fictitious)']);
    const hash = 'c'.repeat(64);
    await publishRetainerVersion(versions, {
      jurisdiction: 'CA',
      effectiveDate: '2026-07-01',
      contentHash: hash,
      storageKey: `retainers/ca/${crypto.randomUUID()}.pdf`,
    });
    const { record } = await requestRetainerSignature({ versions, signatures }, adapter, intake);
    expect(record.contentHash).toBe(hash);
    adapter.sign(record.providerEnvelopeId);
    const signed = await completeRetainerSignature(signatures, adapter, intake.id);
    const reloaded = await signatures.getByEnvelope(record.providerEnvelopeId);
    expect(reloaded?.signedAt).toBe(signed.signedAt);
    expect(reloaded?.evidence?.contentHash).toBe(hash);
  });
});

describe('D1 letter pipeline (RAD-14, migration 0004)', () => {
  it('template → generate → approve → send exactly once → delivery event, all persisted', async () => {
    const { D1LetterTemplateStore, D1LetterVersionStore, D1ApprovalStore, D1DeliveryStore, D1TaskStore } =
      await import('../src/d1-phase5');
    const { publishLetterTemplate, generateLetterVersion, submitLetterForReview, decideLetterApproval } =
      await import('../src/letters');
    const { sendApprovedLetter, recordDeliveryEvent } = await import('../src/delivery');
    const { FakeEmailAdapter, FakePdfAdapter } = await import('@stopallcalls/integrations');

    const matters = new D1MatterStore(env.DB);
    const deps = {
      templates: new D1LetterTemplateStore(env.DB),
      versions: new D1LetterVersionStore(env.DB),
      matters,
      pdf: new FakePdfAdapter(),
      approvals: new D1ApprovalStore(env.DB),
      deliveries: new D1DeliveryStore(env.DB),
      tasks: new D1TaskStore(env.DB),
      email: new FakeEmailAdapter(),
    };
    const intake = await submittedD1Intake(['ABC Collections (Fictitious)']);
    const matter = {
      id: crypto.randomUUID(),
      intakeId: intake.id,
      agencyId: intake.submittedSnapshot!.agencies[0]!.id,
      clioMatterId: 'clio-1',
      displayNumber: 'FAKE-D1-1',
      state: 'MATTER_CREATED' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await matters.insert(matter);

    const uniqueVersion = Math.floor(Math.random() * 1_000_000) + 2;
    await publishLetterTemplate(deps.templates, {
      jurisdiction: 'CA',
      version: uniqueVersion,
      body: 'To {{agencyName}} re {{matterNumber}}: on behalf of {{consumerName}}, cease contact. {{letterDate}}',
    });
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: '2026-07-18' });
    expect(v1.templateVersion).toBe(uniqueVersion);
    await submitLetterForReview(deps, v1.id);
    await decideLetterApproval(deps, v1.id, {
      actor: { id: 'lawyer-1', role: 'LAWYER' },
      contentHash: v1.contentHash,
      decision: 'APPROVED',
    });
    const send = {
      letterVersionId: v1.id,
      recipient: 'agency-contact@example.test',
      senderAddress: 'letters@firm.example.test',
      gates: ALL_PASSED,
    };
    const first = await sendApprovedLetter(deps, send);
    const retry = await sendApprovedLetter(deps, send);
    expect(retry.id).toBe(first.id);
    expect(deps.email.sent).toHaveLength(1);
    expect((await deps.deliveries.getByIdempotencyKey(first.idempotencyKey))?.status).toBe('SENT');

    await recordDeliveryEvent(deps, { providerMessageId: first.providerMessageId!, status: 'BOUNCED' });
    expect((await matters.getById(matter.id))?.state).toBe('BOUNCED');
    expect(await deps.tasks.listByMatter(matter.id)).toHaveLength(1);
  });
});

describe('D1AuditStore (DATA-004)', () => {
  it('appends, preserves chain order, and the full chain verifies', async () => {
    const { appendAuditEvent, verifyAuditChain } = await import('../src/audit');
    const { D1AuditStore } = await import('../src/d1-audit');
    const store = new D1AuditStore(env.DB);
    for (let i = 0; i < 3; i++) {
      await appendAuditEvent(store, {
        actorId: `staff-${i}`,
        actorType: 'STAFF',
        action: 'D1_TEST_ACTION',
        entity: 'test_entity',
        entityId: `d1-entity-${i}`,
      });
    }
    const events = await store.list();
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(await verifyAuditChain(events)).toMatchObject({ valid: true });
    const last = await store.getLast();
    expect(last?.eventHash).toBe(events.at(-1)?.eventHash);
    // Limited listing keeps chain order (oldest → newest within the window).
    const window = await store.list(2);
    expect(window).toHaveLength(2);
    expect(window[1]?.eventHash).toBe(last?.eventHash);
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
