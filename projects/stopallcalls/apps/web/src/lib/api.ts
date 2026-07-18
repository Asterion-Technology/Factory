import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { ServiceError, getVerifiedSession, type ConsumerSession } from '@stopallcalls/db';
import { getAuthStore } from '@/lib/store';

export const SESSION_COOKIE = 'sac_session';

// SEC-003: intake responses carry PII — never cacheable.
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

export function getSessionToken(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/** INT-002: every intake route requires a verified consumer session. */
export async function requireVerifiedSession(req: NextRequest): Promise<ConsumerSession> {
  const token = getSessionToken(req);
  const session = token ? await getVerifiedSession(getAuthStore(), token) : null;
  if (!session) {
    throw new ServiceError(401, 'NO_SESSION', 'Verify your email to continue.');
  }
  return session;
}

// INT-008: per-IP limiter key. Cloudflare sets cf-connecting-ip in production;
// x-forwarded-for's first hop covers local/proxy dev. The fallback groups
// unattributable traffic into one bucket rather than bypassing limits.
export function getRemoteKey(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function attachSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// API-003: one machine-readable envelope; internals and stack traces never
// reach the consumer.
export async function withErrorHandling(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServiceError) {
      return jsonError(err.status, err.code, err.message);
    }
    if (err instanceof ZodError) {
      return jsonError(422, 'VALIDATION_FAILED', 'One or more fields are invalid.');
    }
    console.error('unhandled intake API error', err instanceof Error ? err.message : 'unknown');
    return jsonError(500, 'INTERNAL', 'Something went wrong. Please try again.');
  }
}
