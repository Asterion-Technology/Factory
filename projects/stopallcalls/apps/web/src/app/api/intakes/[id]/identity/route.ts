import type { NextRequest } from 'next/server';
import { getOwnedIntake, startIdentityVerification } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIdentityAdapter, getIdentityStore, getIntakeStore } from '@/lib/store';

// IDV-001: provider-hosted verification — the consumer is redirected to the
// provider; this app never touches documents or biometrics.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const { record, sessionUrl } = await startIdentityVerification(getIdentityStore(), getIdentityAdapter(), intake);
    return jsonOk({ verification: { id: record.id, status: record.status }, sessionUrl });
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const record = await getIdentityStore().getByIntake(intake.id);
    // Consumers see status only — never checks detail (IDV-002 stays staff-side).
    return jsonOk({ verification: record ? { id: record.id, status: record.status } : null });
  });
}
