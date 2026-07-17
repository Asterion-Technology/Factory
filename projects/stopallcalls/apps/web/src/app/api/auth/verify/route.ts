import type { NextRequest } from 'next/server';
import { authVerifySchema } from '@stopallcalls/contracts';
import { verifyEmailCode } from '@stopallcalls/db';
import { attachSessionCookie, getRemoteKey, jsonOk, withErrorHandling } from '@/lib/api';
import { getAuthStore, getRateLimiter } from '@/lib/store';

// INT-002 step 2: exchange the emailed code for a resumable session cookie.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = authVerifySchema.parse(await req.json());
    const session = await verifyEmailCode(getAuthStore(), body.email, body.code, {
      rateLimiter: getRateLimiter(),
      remoteKey: getRemoteKey(req),
    });
    return attachSessionCookie(jsonOk({ email: session.email }), session.token);
  });
}
