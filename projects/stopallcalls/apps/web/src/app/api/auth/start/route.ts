import type { NextRequest } from 'next/server';
import { authStartSchema } from '@stopallcalls/contracts';
import { ServiceError, startEmailVerification } from '@stopallcalls/db';
import { getRemoteKey, jsonOk, withErrorHandling } from '@/lib/api';
import { getAuthStore, getEmailAdapter, getRateLimiter, getTurnstileAdapter, recordDevCode } from '@/lib/store';

// INT-002 step 1: send a one-time code to the consumer's email.
// INT-008: Turnstile verification + rate limiting guard this unauthenticated
// entry point. The response never reveals the code or whether the email is known.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const body = authStartSchema.parse(await req.json());
    const remoteKey = getRemoteKey(req);

    const human = await getTurnstileAdapter().verify({ token: body.turnstileToken, remoteIp: remoteKey });
    if (!human) {
      throw new ServiceError(403, 'TURNSTILE_FAILED', 'Verification failed. Please refresh and try again.');
    }

    const email = getEmailAdapter();
    await startEmailVerification(getAuthStore(), body.email, {
      rateLimiter: getRateLimiter(),
      remoteKey,
      sendCode: async (to, code) => {
        await email.send({
          idempotencyKey: crypto.randomUUID(),
          to,
          from: 'no-reply@stopallcalls.test',
          subject: 'Your StopAllCalls verification code',
          text: `Your verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
        });
        recordDevCode(to, code);
      },
    });
    return jsonOk({ sent: true }, 202);
  });
}
