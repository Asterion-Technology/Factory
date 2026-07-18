import { decryptSecret, encryptSecret } from '@stopallcalls/db';
import { RealClioAdapter, refreshClioTokens, type ClioOAuthConfig } from '@stopallcalls/integrations';
import { getClioConnectionStore } from '@/lib/store';

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

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Decrypts the stored access token, refreshing (and re-sealing) it first when
 * within the expiry margin. Plaintext tokens exist only in this call frame.
 */
export async function getClioAccessToken(): Promise<string> {
  const store = getClioConnectionStore();
  const connection = await store.get();
  if (!connection) throw new Error('No Clio connection — run the connect flow first.');
  const key = getClioTokenKey();

  if (new Date(connection.expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS) {
    return decryptSecret(key, connection.accessTokenEncrypted);
  }

  const refreshToken = await decryptSecret(key, connection.refreshTokenEncrypted);
  const tokens = await refreshClioTokens(getClioOAuthConfig(), refreshToken);
  await store.upsert({
    ...connection,
    accessTokenEncrypted: await encryptSecret(key, tokens.accessToken),
    refreshTokenEncrypted: await encryptSecret(key, tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    updatedAt: new Date().toISOString(),
  });
  return tokens.accessToken;
}

/** The production ClioAdapter, bound to the stored (auto-refreshing) connection. */
export function getRealClioAdapter(): RealClioAdapter {
  return new RealClioAdapter({
    baseUrl: getClioOAuthConfig().baseUrl,
    getAccessToken: getClioAccessToken,
  });
}
