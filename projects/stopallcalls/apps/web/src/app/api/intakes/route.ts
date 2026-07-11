import type { NextRequest } from 'next/server';
import { createOrResumeIntake, toClientIntake } from '@stopallcalls/db';
import { attachSessionCookie, getSessionToken, jsonOk, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

// Creates a draft intake, or resumes the session's active one (idempotent).
// TODO(AST-169): Turnstile verification + rate limiting before create (INT-008)
// — blocked on Cloudflare provisioning.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const token = getSessionToken(req) ?? crypto.randomUUID();
    const intake = await createOrResumeIntake(getIntakeStore(), token);
    return attachSessionCookie(jsonOk({ intake: toClientIntake(intake) }, 201), token);
  });
}

// Resume endpoint for returning visitors (INT-002 save/resume).
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const token = getSessionToken(req);
    const intake = token ? await getIntakeStore().findActiveBySession(token) : null;
    return jsonOk({ intake: intake ? toClientIntake(intake) : null });
  });
}
