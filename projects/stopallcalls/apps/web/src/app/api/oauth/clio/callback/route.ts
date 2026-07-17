import { NextResponse, type NextRequest } from 'next/server';
import { encryptSecret } from '@stopallcalls/db';
import { exchangeClioCode } from '@stopallcalls/integrations';
import { jsonError, withErrorHandling } from '@/lib/api';
import { CLIO_STATE_COOKIE, clioConnectEnabled, getClioOAuthConfig, getClioTokenKey } from '@/lib/clio';
import { getClioConnectionStore } from '@/lib/store';

// CLIO-001 connect step 2: state-checked code exchange; tokens are encrypted
// before they touch storage and never appear in the response or logs.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const config = getClioOAuthConfig();

    const state = req.nextUrl.searchParams.get('state');
    const cookieState = req.cookies.get(CLIO_STATE_COOKIE)?.value;
    if (!state || !cookieState || state !== cookieState) {
      return jsonError(403, 'STATE_MISMATCH', 'The authorization state did not match. Start the connection again.');
    }
    const code = req.nextUrl.searchParams.get('code');
    if (!code) {
      return jsonError(422, 'CODE_MISSING', 'Clio did not return an authorization code.');
    }

    const tokens = await exchangeClioCode(config, code);

    // Identify the connected tenant for the audit trail (no PII beyond name).
    let tenantRef = 'unknown';
    try {
      const who = await fetch(`${config.baseUrl}/api/v4/users/who_am_i.json?fields=id,name`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (who.ok) {
        const body = (await who.json()) as { data?: { id?: number; name?: string } };
        tenantRef = body.data ? `${body.data.id ?? 'user'}:${body.data.name ?? ''}` : 'unknown';
      }
    } catch {
      // Connection still succeeds; tenantRef stays 'unknown'.
    }

    const key = getClioTokenKey();
    const store = getClioConnectionStore();
    const existing = await store.get();
    const now = new Date().toISOString();
    await store.upsert({
      id: existing?.id ?? crypto.randomUUID(),
      tenantRef,
      accessTokenEncrypted: await encryptSecret(key, tokens.accessToken),
      refreshTokenEncrypted: await encryptSecret(key, tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    const res = new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Clio connected</title>
       <body style="font-family:system-ui;max-width:32rem;margin:4rem auto">
       <h1>Clio connected</h1>
       <p>The StopAllCalls integration is now authorized (${tenantRef.split(':')[1] || 'account'}).
       You can close this tab. Consider turning ALLOW_CLIO_CONNECT off.</p></body>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
    res.cookies.delete(CLIO_STATE_COOKIE);
    return res;
  });
}
