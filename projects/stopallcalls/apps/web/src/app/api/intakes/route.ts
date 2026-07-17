import type { NextRequest } from 'next/server';
import { createOrResumeIntake, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

// Creates a draft intake, or resumes the consumer's active one (idempotent —
// INT-008 duplicate prevention holds across devices because ownership is the
// verified email, not the cookie).
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const intake = await createOrResumeIntake(getIntakeStore(), session.email);
    return jsonOk({ intake: toClientIntake(intake) }, 201);
  });
}

// Resume endpoint for returning visitors (INT-002 save/resume).
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const intake = await getIntakeStore().findActiveByConsumer(session.email);
    return jsonOk({ intake: intake ? toClientIntake(intake) : null });
  });
}
