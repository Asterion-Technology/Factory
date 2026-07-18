import type { NextRequest } from 'next/server';
import {
  completeRetainerSignature,
  getOwnedIntake,
  requestRetainerSignature,
} from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import {
  getIntakeStore,
  getRetainerSignatureStore,
  getRetainerVersionStore,
  getSignatureAdapter,
} from '@/lib/store';

// RET-001..005: e-signature against the active immutable retainer version.
// POST starts (or re-issues) the signing session; PUT records completion
// after polling the provider's envelope status.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const { record, signingUrl } = await requestRetainerSignature(
      { versions: getRetainerVersionStore(), signatures: getRetainerSignatureStore() },
      getSignatureAdapter(),
      intake,
    );
    return jsonOk({
      signature: { id: record.id, retainerVersionId: record.retainerVersionId, signedAt: record.signedAt },
      signingUrl,
    });
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const record = await completeRetainerSignature(getRetainerSignatureStore(), getSignatureAdapter(), intake.id);
    return jsonOk({
      signature: { id: record.id, retainerVersionId: record.retainerVersionId, signedAt: record.signedAt },
    });
  });
}
