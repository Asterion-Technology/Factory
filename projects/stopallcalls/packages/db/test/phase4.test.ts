import { describe, expect, it } from 'vitest';
import { evaluateGates, canCreateMatters, type PricingConfig } from '@stopallcalls/domain';
import {
  FakeIdentityAdapter,
  FakePaymentAdapter,
  FakeSignatureAdapter,
} from '@stopallcalls/integrations';
import {
  InMemoryIdentityStore,
  InMemoryIntakeStore,
  InMemoryOrderStore,
  InMemoryPaymentStore,
  InMemoryRetainerSignatureStore,
  InMemoryRetainerVersionStore,
  addAgency,
  applyIdentityWebhook,
  applyPaymentWebhook,
  completeRetainerSignature,
  confirmEmtPayment,
  createOrderForIntake,
  createOrResumeIntake,
  identityGateFromRecord,
  paymentGateFromRecords,
  publishRetainerVersion,
  recordIdentityOverride,
  requestRetainerSignature,
  retainerGateFromRecord,
  saveProfile,
  startEmtPayment,
  startHostedPayment,
  startIdentityVerification,
  submitIntake,
  type IntakeRecord,
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

const PRICING: PricingConfig = { baseFeeCents: 9900, perAgencyFeeCents: 2500, taxRateBps: 1300, currency: 'CAD' };

const SIG = 'fake-valid-signature';

async function submittedIntake(agencies: string[] = ['ABC Collections (Fictitious)']): Promise<IntakeRecord> {
  const store = new InMemoryIntakeStore();
  let intake = await createOrResumeIntake(store, CONSUMER);
  intake = await saveProfile(store, CONSUMER, intake.id, PROFILE, intake.version);
  for (const name of agencies) {
    intake = await addAgency(store, CONSUMER, intake.id, AGENCY(name), intake.version);
  }
  return submitIntake(store, CONSUMER, intake.id, ATTEST, intake.version);
}

describe('createOrderForIntake (PAY-001/PAY-002)', () => {
  it('prices from the frozen snapshot and is idempotent per intake', async () => {
    const store = new InMemoryOrderStore();
    const intake = await submittedIntake(['A (Fictitious)', 'B (Fictitious)']);
    const order = await createOrderForIntake(store, PRICING, intake);
    expect(order.subtotalCents).toBe(9900 + 2 * 2500);
    expect(order.totalCents).toBe(order.subtotalCents + order.taxCents);
    const again = await createOrderForIntake(store, PRICING, intake);
    expect(again.id).toBe(order.id);
  });

  it('refuses unsubmitted intakes', async () => {
    const store = new InMemoryOrderStore();
    const intakes = new InMemoryIntakeStore();
    const draft = await createOrResumeIntake(intakes, CONSUMER);
    await expect(createOrderForIntake(store, PRICING, draft)).rejects.toMatchObject({ code: 'NOT_SUBMITTED' });
  });
});

describe('hosted payments + webhooks (PAY-003/PAY-004)', () => {
  async function checkout() {
    const orders = new InMemoryOrderStore();
    const payments = new InMemoryPaymentStore();
    const adapter = new FakePaymentAdapter();
    const intake = await submittedIntake();
    const order = await createOrderForIntake(orders, PRICING, intake);
    const started = await startHostedPayment(payments, adapter, order, 'CARD');
    return { payments, adapter, order, started };
  }

  it('is idempotent per order and returns the same hosted checkout', async () => {
    const { payments, adapter, order, started } = await checkout();
    const again = await startHostedPayment(payments, adapter, order, 'CARD');
    expect(again.payment.id).toBe(started.payment.id);
    expect(again.redirectUrl).toBe(started.redirectUrl);
    expect(await payments.listByOrder(order.id)).toHaveLength(1);
  });

  it('rejects an invalid webhook signature before any state change', async () => {
    const { payments, adapter, started } = await checkout();
    const event = { eventId: 'evt-1', providerRef: started.payment.providerRef!, status: 'AUTHORIZED' as const };
    await expect(
      applyPaymentWebhook(payments, adapter, JSON.stringify(event), 'wrong-signature', event),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
    expect((await payments.getById(started.payment.id))?.state).toBe('PENDING');
  });

  it('EXIT CRITERION: webhook replay applies exactly once', async () => {
    const { payments, adapter, started } = await checkout();
    const event = { eventId: 'evt-1', providerRef: started.payment.providerRef!, status: 'AUTHORIZED' as const };
    const raw = JSON.stringify(event);
    const first = await applyPaymentWebhook(payments, adapter, raw, SIG, event);
    expect(first.state).toBe('AUTHORIZED');
    const replay = await applyPaymentWebhook(payments, adapter, raw, SIG, event);
    expect(replay.state).toBe('AUTHORIZED');
    expect(replay.processedEventIds).toEqual(['evt-1']);
    // A later real event still applies after the replay.
    const paid = { eventId: 'evt-2', providerRef: started.payment.providerRef!, status: 'PAID' as const };
    expect((await applyPaymentWebhook(payments, adapter, JSON.stringify(paid), SIG, paid)).state).toBe('PAID');
  });

  it('walks PENDING → AUTHORIZED → PAID when the provider settles directly to PAID', async () => {
    const { payments, adapter, started } = await checkout();
    const paid = { eventId: 'evt-9', providerRef: started.payment.providerRef!, status: 'PAID' as const };
    expect((await applyPaymentWebhook(payments, adapter, JSON.stringify(paid), SIG, paid)).state).toBe('PAID');
  });

  it('allows retry after FAILED without duplicating settled payments', async () => {
    const { payments, adapter, order, started } = await checkout();
    const failed = { eventId: 'evt-f', providerRef: started.payment.providerRef!, status: 'FAILED' as const };
    await applyPaymentWebhook(payments, adapter, JSON.stringify(failed), SIG, failed);
    // Failed payment is inactive; a new checkout may start.
    const second = await startHostedPayment(payments, adapter, order, 'CARD');
    expect(second.payment.state).toBe('PENDING');
    expect(paymentGateFromRecords(await payments.listByOrder(order.id))).toBe('PENDING');
  });
});

describe('EMT workflow (PAY-005)', () => {
  it('creates AWAITING_EMT, blocks non-billing staff, records the confirmer', async () => {
    const orders = new InMemoryOrderStore();
    const payments = new InMemoryPaymentStore();
    const intake = await submittedIntake();
    const order = await createOrderForIntake(orders, PRICING, intake);
    const payment = await startEmtPayment(payments, order);
    expect(payment.state).toBe('AWAITING_EMT');
    expect(await startEmtPayment(payments, order)).toMatchObject({ id: payment.id });

    await expect(
      confirmEmtPayment(payments, payment.id, { id: 'staff-1', role: 'INTAKE_STAFF' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const confirmed = await confirmEmtPayment(payments, payment.id, { id: 'billing-1', role: 'BILLING' });
    expect(confirmed.state).toBe('EMT_CONFIRMED');
    expect(confirmed.emtConfirmedBy).toBe('billing-1');
    await expect(
      confirmEmtPayment(payments, payment.id, { id: 'billing-1', role: 'BILLING' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(paymentGateFromRecords(await payments.listByOrder(order.id))).toBe('PASSED');
  });
});

describe('identity verification (IDV-001..005)', () => {
  async function session() {
    const store = new InMemoryIdentityStore();
    const adapter = new FakeIdentityAdapter();
    const intake = await submittedIntake();
    const started = await startIdentityVerification(store, adapter, intake);
    return { store, adapter, intake, started };
  }

  it('is idempotent per intake and correlates by opaque intake id', async () => {
    const { store, adapter, intake, started } = await session();
    const again = await startIdentityVerification(store, adapter, intake);
    expect(again.record.id).toBe(started.record.id);
    expect(again.sessionUrl).toBe(started.sessionUrl);
  });

  it('re-points the record when the provider issues a different session (RAD-26 UAT)', async () => {
    const { store, intake, started } = await session();
    // A different adapter issuing a fresh providerRef for the same intake —
    // the record must follow it or its webhooks can never match. (Warm-up
    // call advances the fake's counter so its ref differs from the first.)
    const provider2 = new FakeIdentityAdapter();
    await provider2.createSession({ idempotencyKey: 'warmup', clientRef: 'warmup' });
    const reissued = await startIdentityVerification(store, provider2, intake);
    expect(reissued.record.id).toBe(started.record.id);
    expect(reissued.record.providerRef).not.toBe(started.record.providerRef);
    expect(reissued.record.status).toBe('PENDING');
    expect(await store.getByProviderRef(reissued.record.providerRef)).not.toBeNull();
  });

  it('never re-points a settled (VERIFIED/OVERRIDDEN) record', async () => {
    const { store, adapter, intake, started } = await session();
    const evt = { eventId: 'idv-evt-settle', providerRef: started.record.providerRef, status: 'VERIFIED' as const };
    await applyIdentityWebhook(store, adapter, JSON.stringify(evt), SIG, evt);
    const after = await startIdentityVerification(store, new FakeIdentityAdapter(), intake);
    expect(after.record.status).toBe('VERIFIED');
    expect(after.record.providerRef).toBe(started.record.providerRef);
  });

  it('replay-protects webhooks and routes MISMATCH to human review, override audited', async () => {
    const { store, adapter, started } = await session();
    const evt = {
      eventId: 'idv-evt-1',
      providerRef: started.record.providerRef,
      status: 'MISMATCH' as const,
      checks: { name: 'MISMATCH' as const, dob: 'MATCH' as const },
    };
    const raw = JSON.stringify(evt);
    await expect(applyIdentityWebhook(store, adapter, raw, 'bad-sig', evt)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE',
    });
    const applied = await applyIdentityWebhook(store, adapter, raw, SIG, evt);
    expect(applied.status).toBe('MISMATCH_REVIEW');
    expect(identityGateFromRecord(applied)).toBe('MANUAL_REVIEW');
    const replay = await applyIdentityWebhook(store, adapter, raw, SIG, evt);
    expect(replay.processedEventIds).toEqual(['idv-evt-1']);

    await expect(
      recordIdentityOverride(store, applied.id, { overriddenBy: ' ', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' });
    const overridden = await recordIdentityOverride(store, applied.id, {
      overriddenBy: 'staff-1',
      reason: 'Documents reviewed manually; name mismatch is a legal alias.',
    });
    expect(overridden.status).toBe('OVERRIDDEN');
    expect(identityGateFromRecord(overridden)).toBe('PASSED');

    // A late provider webhook never overwrites the human decision.
    const late = { eventId: 'idv-evt-2', providerRef: started.record.providerRef, status: 'FAILED' as const };
    const after = await applyIdentityWebhook(store, adapter, JSON.stringify(late), SIG, late);
    expect(after.status).toBe('OVERRIDDEN');
  });

  it('VERIFIED passes the gate; a VERIFIED record cannot be overridden', async () => {
    const { store, adapter, started } = await session();
    const evt = { eventId: 'e', providerRef: started.record.providerRef, status: 'VERIFIED' as const };
    const applied = await applyIdentityWebhook(store, adapter, JSON.stringify(evt), SIG, evt);
    expect(identityGateFromRecord(applied)).toBe('PASSED');
    await expect(
      recordIdentityOverride(store, applied.id, { overriddenBy: 'staff-1', reason: 'n/a' }),
    ).rejects.toMatchObject({ code: 'NOT_OVERRIDABLE' });
  });
});

describe('retainer versions + signatures (RET-001..005)', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);

  function stores() {
    return {
      versions: new InMemoryRetainerVersionStore(),
      signatures: new InMemoryRetainerSignatureStore(),
    };
  }

  it('publishes immutable versions and binds envelopes to the exact content hash', async () => {
    const s = stores();
    const adapter = new FakeSignatureAdapter();
    const intake = await submittedIntake();
    await expect(
      publishRetainerVersion(s.versions, {
        jurisdiction: 'CA',
        effectiveDate: '2026-07-01',
        contentHash: 'not-a-hash',
        storageKey: 'retainers/ca/v1.pdf',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_HASH' });
    const v1 = await publishRetainerVersion(s.versions, {
      jurisdiction: 'CA',
      effectiveDate: '2026-07-01',
      contentHash: HASH_A,
      storageKey: 'retainers/ca/v1.pdf',
    });
    const { record, signingUrl } = await requestRetainerSignature(s, adapter, intake);
    expect(record.retainerVersionId).toBe(v1.id);
    expect(record.contentHash).toBe(HASH_A);
    expect(signingUrl).toContain('sign.example.test');
    // Idempotent re-request.
    expect((await requestRetainerSignature(s, adapter, intake)).record.id).toBe(record.id);
  });

  it('completes exactly once with recorded evidence and passes the gate', async () => {
    const s = stores();
    const adapter = new FakeSignatureAdapter();
    const intake = await submittedIntake();
    await publishRetainerVersion(s.versions, {
      jurisdiction: 'CA',
      effectiveDate: '2026-07-01',
      contentHash: HASH_A,
      storageKey: 'retainers/ca/v1.pdf',
    });
    const { record } = await requestRetainerSignature(s, adapter, intake);
    await expect(completeRetainerSignature(s.signatures, adapter, intake.id)).rejects.toMatchObject({
      code: 'NOT_SIGNED',
    });
    adapter.sign(record.providerEnvelopeId);
    const signed = await completeRetainerSignature(s.signatures, adapter, intake.id);
    expect(signed.signedAt).toBeTruthy();
    expect(signed.evidence?.contentHash).toBe(HASH_A);
    expect(retainerGateFromRecord(signed)).toBe('PASSED');
    // Second completion is a no-op returning the same evidence.
    expect((await completeRetainerSignature(s.signatures, adapter, intake.id)).evidence).toEqual(signed.evidence);
  });

  it('rejects signing when a newer version superseded the pending request (WF-005 analogue)', async () => {
    const s = stores();
    const adapter = new FakeSignatureAdapter();
    const intake = await submittedIntake();
    await publishRetainerVersion(s.versions, {
      jurisdiction: 'CA',
      effectiveDate: '2026-07-01',
      contentHash: HASH_A,
      storageKey: 'retainers/ca/v1.pdf',
    });
    await requestRetainerSignature(s, adapter, intake);
    await new Promise((r) => setTimeout(r, 2));
    await publishRetainerVersion(s.versions, {
      jurisdiction: 'CA',
      effectiveDate: '2026-08-01',
      contentHash: HASH_B,
      storageKey: 'retainers/ca/v2.pdf',
    });
    await expect(requestRetainerSignature(s, adapter, intake)).rejects.toMatchObject({
      code: 'VERSION_SUPERSEDED',
    });
  });
});

describe('EXIT CRITERION: all matter-creation gates enforced end-to-end', () => {
  it('gates stay closed until evidence+conflict+identity+retainer+payment all pass', async () => {
    const gates = (over: Partial<Parameters<typeof evaluateGates>[0]>) =>
      evaluateGates({
        evidence: { total: 1, clean: 1 },
        conflictDisposition: 'CLEAR',
        ...over,
      });
    expect(canCreateMatters(gates({}))).toBe(false);
    expect(canCreateMatters(gates({ identity: 'PASSED', retainer: 'PASSED' }))).toBe(false);
    expect(canCreateMatters(gates({ identity: 'PASSED', retainer: 'PASSED', payment: 'PASSED' }))).toBe(true);
    expect(
      canCreateMatters(gates({ identity: 'MANUAL_REVIEW', retainer: 'PASSED', payment: 'PASSED' })),
    ).toBe(false);
    expect(
      canCreateMatters(
        evaluateGates({
          evidence: { total: 1, clean: 0 },
          conflictDisposition: 'CLEAR',
          identity: 'PASSED',
          retainer: 'PASSED',
          payment: 'PASSED',
        }),
      ),
    ).toBe(false);
  });
});
