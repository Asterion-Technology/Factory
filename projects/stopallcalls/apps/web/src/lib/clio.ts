import type { ClioOAuthConfig } from '@stopallcalls/integrations';

// Clio OAuth config from env. The connect routes are additionally gated by
// ALLOW_CLIO_CONNECT=1 — an interim admin switch until Cloudflare Access
// provides real staff authentication; flip it off once connected.

export const CLIO_STATE_COOKIE = 'sac_clio_state';

export function clioConnectEnabled(): boolean {
  return process.env.ALLOW_CLIO_CONNECT === '1';
}

export function getClioOAuthConfig(): ClioOAuthConfig {
  const baseUrl = process.env.CLIO_BASE_URL;
  const clientId = process.env.CLIO_CLIENT_ID;
  const clientSecret = process.env.CLIO_CLIENT_SECRET;
  const redirectUri = process.env.CLIO_REDIRECT_URI;
  if (!baseUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Error('Clio OAuth env incomplete: CLIO_BASE_URL / CLIO_CLIENT_ID / CLIO_CLIENT_SECRET / CLIO_REDIRECT_URI');
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), clientId, clientSecret, redirectUri };
}

export function getClioTokenKey(): string {
  const key = process.env.CLIO_TOKEN_KEY;
  if (!key) throw new Error('CLIO_TOKEN_KEY missing');
  return key;
}
