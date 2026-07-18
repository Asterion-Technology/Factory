// CLIO-001: OAuth 2.0 against Clio Manage. Pure helpers — no storage, no
// framework. The web app supplies config from env; tokens are handed straight
// to the encrypted connection store and never reach a browser.

export interface ClioOAuthConfig {
  /** Regional instance, e.g. https://ca.app.clio.com (no trailing slash). */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ClioTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute ISO expiry derived from expires_in at exchange time. */
  expiresAt: string;
}

export function buildClioAuthorizeUrl(config: ClioOAuthConfig, state: string): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
  });
  return `${config.baseUrl}/oauth/authorize?${query.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(
  config: ClioOAuthConfig,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  const res = await fetchImpl(`${config.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...params,
    }),
  });
  if (!res.ok) {
    // Never include the response body in errors that could reach logs with
    // provider details; status is enough to diagnose.
    throw new Error(`Clio token endpoint returned ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

const toTokens = (body: TokenResponse, previousRefreshToken?: string): ClioTokens => ({
  accessToken: body.access_token,
  // Clio may omit refresh_token on refresh responses; keep the existing one.
  refreshToken: body.refresh_token ?? previousRefreshToken ?? '',
  expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
});

export async function exchangeClioCode(
  config: ClioOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClioTokens> {
  const body = await tokenRequest(
    config,
    { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri },
    fetchImpl,
  );
  return toTokens(body);
}

export async function refreshClioTokens(
  config: ClioOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClioTokens> {
  const body = await tokenRequest(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl);
  return toTokens(body, refreshToken);
}
