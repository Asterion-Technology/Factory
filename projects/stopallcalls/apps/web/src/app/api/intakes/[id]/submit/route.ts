import type { NextRequest } from 'next/server';
import { intakeSubmitSchema } from '@stopallcalls/contracts';
import { submitIntake, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireSessionToken, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

// Freezes the submission snapshot (INT-007) and requests DRAFT → SUBMITTED
// through the domain transition guard (WF-001).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const token = requireSessionToken(req);
    const { id } = await params;
    const body = intakeSubmitSchema.parse(await req.json());
    const intake = await submitIntake(getIntakeStore(), token, id, body.attestations, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}
