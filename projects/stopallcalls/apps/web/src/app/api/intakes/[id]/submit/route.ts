import type { NextRequest } from 'next/server';
import { intakeSubmitSchema } from '@stopallcalls/contracts';
import { submitIntake, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { startConflictCheck } from '@/lib/clio';
import { getIntakeStore } from '@/lib/store';

// Freezes the submission snapshot (INT-007) and requests DRAFT → SUBMITTED
// through the domain transition guard (WF-001).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const body = intakeSubmitSchema.parse(await req.json());
    const intake = await submitIntake(getIntakeStore(), session.email, id, body.attestations, body.expectedVersion);
    // CLIO-002 kicks off on the frozen snapshot; outcome is staff-facing only.
    await startConflictCheck(intake);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}
