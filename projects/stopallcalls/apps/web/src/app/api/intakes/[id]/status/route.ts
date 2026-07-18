import type { NextRequest } from 'next/server';
import { getOwnedIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import {
  getEvidenceStore,
  getIdentityStore,
  getIntakeStore,
  getMatterStore,
  getOrderStore,
  getPaymentStore,
  getRetainerSignatureStore,
} from '@/lib/store';

// UI-001: consumer case-status aggregate. Strictly consumer-safe — conflict
// checks expose NOTHING here (WF-006): the "case review" step derives only
// from whether matters exist, never from dispositions. Identity mismatches
// surface as a neutral "under review", never check detail (IDV-002).

type LetterProgress = 'NONE' | 'PREPARING' | 'SENT' | 'DELIVERED';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);

    const evidence = await getEvidenceStore().listByIntake(intake.id);
    const identity = await getIdentityStore().getByIntake(intake.id);
    const signature = await getRetainerSignatureStore().getByIntake(intake.id);
    const order = await getOrderStore().getByIntake(intake.id);
    const payments = order ? await getPaymentStore().listByOrder(order.id) : [];
    const matters = await getMatterStore().listByIntake(intake.id);

    const states = matters.map((m) => m.state);
    const letter: LetterProgress = states.some((s) => s === 'DELIVERED' || s === 'FOLLOW_UP_DUE' || s === 'CLOSED')
      ? 'DELIVERED'
      : states.some((s) => s === 'SENT' || s === 'BOUNCED')
        ? 'SENT'
        : states.length > 0
          ? 'PREPARING'
          : 'NONE';

    const identityStatus =
      identity === null
        ? 'NOT_STARTED'
        : identity.status === 'VERIFIED' || identity.status === 'OVERRIDDEN'
          ? 'VERIFIED'
          : identity.status === 'PENDING'
            ? 'PENDING'
            : 'UNDER_REVIEW';

    const activePayment = payments.find((p) => ['AUTHORIZED', 'PAID', 'EMT_CONFIRMED'].includes(p.state));
    const awaitingEmt = payments.some((p) => p.state === 'AWAITING_EMT');

    return jsonOk({
      status: {
        submitted: intake.state !== 'DRAFT',
        submittedAt: intake.submittedSnapshot?.submittedAt ?? null,
        agencyCount: intake.submittedSnapshot?.agencies.length ?? intake.agencies.length,
        evidence: { total: evidence.length, clean: evidence.filter((e) => e.scanStatus === 'CLEAN').length },
        identity: identityStatus,
        retainerSigned: Boolean(signature?.signedAt),
        payment: activePayment ? 'SETTLED' : awaitingEmt ? 'AWAITING_EMT' : order ? 'STARTED' : 'NOT_STARTED',
        totalCents: order?.totalCents ?? null,
        currency: order?.currency ?? null,
        letter,
      },
    });
  });
}
