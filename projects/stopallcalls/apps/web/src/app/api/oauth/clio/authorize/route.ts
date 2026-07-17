import { NextResponse, type NextRequest } from 'next/server';
import { buildClioAuthorizeUrl } from '@stopallcalls/integrations';
import { jsonError, withErrorHandling } from '@/lib/api';
import { CLIO_STATE_COOKIE, clioConnectEnabled, getClioOAuthConfig } from '@/lib/clio';

// CLIO-001 connect step 1: redirect the (human) administrator to Clio.
// Gated by ALLOW_CLIO_CONNECT until Cloudflare Access lands.
export async function GET(_req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const config = getClioOAuthConfig();
    const state = crypto.randomUUID();
    const res = NextResponse.redirect(buildClioAuthorizeUrl(config, state), 302);
    res.cookies.set(CLIO_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.redirectUri.startsWith('https://'),
      path: '/api/oauth/clio',
      maxAge: 300,
    });
    return res;
  });
}
