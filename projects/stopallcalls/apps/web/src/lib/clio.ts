import { decryptSecret, encryptSecret, runConflictCheck, type IntakeRecord } from '@stopallcalls/db';
import { FakeClioAdapter, RealClioAdapter, refreshClioTokens, type ClioOAuthConfig } from '@stopallcalls/integrations';
import { getClioConnectionStore, getConflictCheckStore } from '@/lib/store';

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

const FAKE_CLIO_KEY = Symbol.for('stopallcalls.fakeClioAdapter');
const gClio = globalThis as { [FAKE_CLIO_KEY]?: FakeClioAdapter };

/**
 * The tenant's Clio when a connection is stored (DEV-003: real only via
 * explicit configuration); the deterministic fake otherwise, so local dev and
 * E2E exercise the same conflict-check path.
 */
export async function getClioAdapter(): Promise<RealClioAdapter | FakeClioAdapter> {
  if (await getClioConnectionStore().get()) return getRealClioAdapter();
  gClio[FAKE_CLIO_KEY] ??= new FakeClioAdapter();
  return gClio[FAKE_CLIO_KEY];
}

/**
 * CLIO-002: the conflict search runs automatically once a snapshot is frozen.
 * Best-effort — a Clio outage never blocks or leaks to the consumer (WF-006);
 * runConflictCheck is idempotent per intake, so staff can re-run it any time
 * from the conflicts API.
 */
export async function startConflictCheck(intake: IntakeRecord): Promise<void> {
  try {
    await runConflictCheck(getConflictCheckStore(), await getClioAdapter(), intake);
  } catch {
    // No identifiers in logs (SEC): the staff conflict API surfaces the gap.
    console.error('post-submit conflict check failed; staff re-run required');
  }
}
