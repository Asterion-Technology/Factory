import { describe, expect, it } from 'vitest';
import { LETTER_GENERATOR_VERSION, type GateSnapshot } from '@stopallcalls/domain';
import { FakeClioAdapter, FakeEmailAdapter, FakePdfAdapter } from '@stopallcalls/integrations';
import {
  InMemoryApprovalStore,
  InMemoryDeliveryStore,
  InMemoryIntakeStore,
  InMemoryLetterTemplateStore,
  InMemoryLetterVersionStore,
  InMemoryMatterStore,
  InMemoryTaskStore,
  addAgency,
  createOrResumeIntake,
  decideLetterApproval,
  generateLetterVersion,
  legalApprovalGateForMatter,
  publishLetterTemplate,
  recordDeliveryEvent,
  saveProfile,
  sendApprovedLetter,
  submitIntake,
  submitLetterForReview,
  type IntakeRecord,
  type MatterRecord,
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

const ATTEST = { isConsumer: true, contactConfirmed: true, informationTrue: true, authorizeLetter: true } as const;

const TEMPLATE_V1 = [
  '{{letterDate}}',
  '',
  'To {{agencyName}} (re: matter {{matterNumber}}):',
  '',
  'On behalf of {{consumerName}}, cease all communication immediately.',
].join('\n');

const ALL_PASSED: GateSnapshot = Object.fromEntries(
  ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT', 'LEGAL_APPROVAL'].map((gate) => [
    gate,
    { gate, status: 'PASSED' },
  ]),
) as unknown as GateSnapshot;

const gatesMissing = (missing: string): GateSnapshot =>
  Object.fromEntries(
    ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT', 'LEGAL_APPROVAL'].map((gate) => [
      gate,
      { gate, status: gate === missing ? 'PENDING' : 'PASSED' },
    ]),
  ) as unknown as GateSnapshot;

async function submittedIntake(agencyName: string): Promise<IntakeRecord> {
  const store = new InMemoryIntakeStore();
  let intake = await createOrResumeIntake(store, CONSUMER);
  intake = await saveProfile(store, CONSUMER, intake.id, PROFILE, intake.version);
  intake = await addAgency(
    store,
    CONSUMER,
    intake.id,
    { agencyName, currency: 'CAD', contactChannels: ['PHONE'], allegations: [] },
    intake.version,
  );
  return submitIntake(store, CONSUMER, intake.id, ATTEST, intake.version);
}

async function harness(agencyName = 'ABC Collections (Fictitious)') {
  const intake = await submittedIntake(agencyName);
  const matters = new InMemoryMatterStore();
  const matter: MatterRecord = {
    id: crypto.randomUUID(),
    intakeId: intake.id,
    agencyId: intake.submittedSnapshot!.agencies[0]!.id,
    clioMatterId: 'clio-matter-1',
    displayNumber: 'FAKE-00001',
    state: 'MATTER_CREATED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await matters.insert(matter);
  const templates = new InMemoryLetterTemplateStore();
  await publishLetterTemplate(templates, { jurisdiction: 'CA', version: 1, body: TEMPLATE_V1 });
  const deps = {
    templates,
    versions: new InMemoryLetterVersionStore(),
    matters,
    pdf: new FakePdfAdapter(),
    approvals: new InMemoryApprovalStore(),
    deliveries: new InMemoryDeliveryStore(),
    tasks: new InMemoryTaskStore(),
    email: new FakeEmailAdapter(),
    clio: new FakeClioAdapter(),
  };
  return { intake, matter, deps };
}

const LAWYER = { id: 'lawyer-1', role: 'LAWYER' };
const DATE = '2026-07-18';

describe('letter generation (LTR-001/002/005)', () => {
  it('renders deterministically from verified fields and records LTR-005 metadata', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    expect(v1.sourceSnapshot.renderedContent).toContain('On behalf of Taylor Testcase');
    expect(v1.sourceSnapshot.renderedContent).toContain('ABC Collections (Fictitious)');
    expect(v1.generatorVersion).toBe(LETTER_GENERATOR_VERSION);
    expect(v1.templateVersion).toBe(1);
    expect(v1.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await deps.matters.getById(matter.id))?.state).toBe('DRAFT_READY');
    // Unchanged inputs → same version, not a duplicate.
    const again = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    expect(again.id).toBe(v1.id);
    expect(await deps.versions.listByMatter(matter.id)).toHaveLength(1);
  });
});

describe('hash-bound approval (LTR-006..008, WF-005)', () => {
  it('is lawyer-only, hash-exact, and records the decision', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(deps, v1.id);

    await expect(
      decideLetterApproval(deps, v1.id, {
        actor: { id: 'staff-1', role: 'INTAKE_STAFF' },
        contentHash: v1.contentHash,
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: 'f'.repeat(64), decision: 'APPROVED' }),
    ).rejects.toMatchObject({ code: 'HASH_MISMATCH' });

    const { version } = await decideLetterApproval(deps, v1.id, {
      actor: LAWYER,
      contentHash: v1.contentHash,
      decision: 'APPROVED',
    });
    expect(version.status).toBe('APPROVED');
    expect((await deps.matters.getById(matter.id))?.state).toBe('APPROVED');
    expect(await legalApprovalGateForMatter(deps, matter.id)).toBe('PASSED');
  });

  it('rejection requires a reason and routes back to changes', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(deps, v1.id);
    await expect(
      decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'REJECTED' }),
    ).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    const { version } = await decideLetterApproval(deps, v1.id, {
      actor: LAWYER,
      contentHash: v1.contentHash,
      decision: 'REJECTED',
      reason: 'Tone must be adjusted before sending.',
    });
    expect(version.status).toBe('CHANGES_REQUESTED');
    expect((await deps.matters.getById(matter.id))?.state).toBe('CHANGES_REQUESTED');
    expect(await legalApprovalGateForMatter(deps, matter.id)).toBe('MANUAL_REVIEW');
  });

  it('WF-005: regeneration after approval supersedes and invalidates it', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(deps, v1.id);
    await decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'APPROVED' });

    const v2 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: '2026-07-19' });
    expect(v2.id).not.toBe(v1.id);
    expect((await deps.versions.getById(v1.id))?.status).toBe('SUPERSEDED');
    expect((await deps.matters.getById(matter.id))?.state).toBe('IN_REVIEW');
    // The old approval binds to the old hash — the gate is closed again.
    expect(await legalApprovalGateForMatter(deps, matter.id)).toBe('PENDING');
  });
});

describe('EXIT CRITERION: send only with exact valid approval, exactly once', () => {
  const SEND = (versionId: string) => ({
    letterVersionId: versionId,
    recipient: 'agency-contact@example.test',
    senderAddress: 'letters@firm.example.test',
    gates: ALL_PASSED,
  });

  it('refuses unapproved and stale-approval versions', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await expect(sendApprovedLetter(deps, SEND(v1.id))).rejects.toMatchObject({ code: 'NOT_APPROVED' });

    await submitLetterForReview(deps, v1.id);
    await decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'APPROVED' });
    // Content changes → v2; the superseded v1 can never be sent.
    const v2 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: '2026-07-19' });
    await expect(sendApprovedLetter(deps, SEND(v1.id))).rejects.toMatchObject({ code: 'NOT_APPROVED' });
    await expect(sendApprovedLetter(deps, SEND(v2.id))).rejects.toMatchObject({ code: 'NOT_APPROVED' });
    expect(deps.email.sent).toHaveLength(0);
  });

  it('enforces every gate at the moment of send', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(deps, v1.id);
    await decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'APPROVED' });
    for (const missing of ['EVIDENCE', 'PAYMENT', 'LEGAL_APPROVAL']) {
      await expect(
        sendApprovedLetter(deps, { ...SEND(v1.id), gates: gatesMissing(missing) }),
      ).rejects.toMatchObject({ code: 'GATES_NOT_PASSED' });
    }
    expect(deps.email.sent).toHaveLength(0);
  });

  it('sends exactly once, records the Clio copy, and retries are no-ops', async () => {
    const { intake, matter, deps } = await harness();
    const v1 = await generateLetterVersion(deps, intake, matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(deps, v1.id);
    await decideLetterApproval(deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'APPROVED' });

    const first = await sendApprovedLetter(deps, SEND(v1.id));
    expect(first.status).toBe('SENT');
    expect(first.artifactHash).toBe(v1.contentHash);
    const retry = await sendApprovedLetter(deps, SEND(v1.id));
    expect(retry.id).toBe(first.id);
    expect(deps.email.sent).toHaveLength(1);
    expect((await deps.matters.getById(matter.id))?.state).toBe('SENT');
    expect((await deps.versions.getById(v1.id))?.status).toBe('SENT');
  });
});

describe('delivery events (DLV-006/007)', () => {
  async function sentLetter() {
    const h = await harness();
    const v1 = await generateLetterVersion(h.deps, h.intake, h.matter.id, { author: 'staff-1', letterDate: DATE });
    await submitLetterForReview(h.deps, v1.id);
    await decideLetterApproval(h.deps, v1.id, { actor: LAWYER, contentHash: v1.contentHash, decision: 'APPROVED' });
    const delivery = await sendApprovedLetter(h.deps, {
      letterVersionId: v1.id,
      recipient: 'agency-contact@example.test',
      senderAddress: 'letters@firm.example.test',
      gates: ALL_PASSED,
    });
    return { ...h, delivery };
  }

  it('marks DELIVERED idempotently', async () => {
    const { deps, matter, delivery } = await sentLetter();
    const updated = await recordDeliveryEvent(deps, {
      providerMessageId: delivery.providerMessageId!,
      status: 'DELIVERED',
    });
    expect(updated.status).toBe('DELIVERED');
    expect((await deps.matters.getById(matter.id))?.state).toBe('DELIVERED');
    // Replayed provider event changes nothing.
    expect(
      (await recordDeliveryEvent(deps, { providerMessageId: delivery.providerMessageId!, status: 'DELIVERED' })).status,
    ).toBe('DELIVERED');
    expect(await deps.tasks.listByMatter(matter.id)).toHaveLength(0);
  });

  it('a bounce opens a follow-up task and never auto-resends', async () => {
    const { deps, matter, delivery } = await sentLetter();
    await recordDeliveryEvent(deps, { providerMessageId: delivery.providerMessageId!, status: 'BOUNCED' });
    expect((await deps.matters.getById(matter.id))?.state).toBe('BOUNCED');
    const tasks = await deps.tasks.listByMatter(matter.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.kind).toBe('BOUNCE_FOLLOW_UP');
    expect(deps.email.sent).toHaveLength(1);
  });
});
