import { describe, expect, it, vi } from 'vitest';
import { buildClioAuthorizeUrl, exchangeClioCode, refreshClioTokens } from '../src/index';

const CONFIG = {
  baseUrl: 'https://ca.app.clio.test',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'http://127.0.0.1:3000/api/oauth/clio/callback',
};

const tokenResponse = (over: Record<string, unknown> = {}) =>
  ({
    ok: true,
    json: async () => ({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      token_type: 'bearer',
      ...over,
    }),
  }) as Response;

describe('buildClioAuthorizeUrl', () => {
  it('targets the regional authorize endpoint with exact redirect and state', () => {
    const url = new URL(buildClioAuthorizeUrl(CONFIG, 'state-123'));
    expect(url.origin).toBe('https://ca.app.clio.test');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get('state')).toBe('state-123');
  });
});

describe('exchangeClioCode', () => {
  it('posts the code grant form-encoded and derives an absolute expiry', async () => {
    const fetchMock = vi.fn(async () => tokenResponse());
    const tokens = await exchangeClioCode(CONFIG, 'auth-code', fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledWith('https://ca.app.clio.test/oauth/token', expect.objectContaining({ method: 'POST' }));
    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(tokens.accessToken).toBe('access-1');
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('fails with only the status code on non-200 (no body in errors)', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }) as Response);
    await expect(exchangeClioCode(CONFIG, 'bad', fetchMock as unknown as typeof fetch)).rejects.toThrow('401');
  });
});

describe('refreshClioTokens', () => {
  it('keeps the previous refresh token when Clio omits it', async () => {
    const fetchMock = vi.fn(async () => tokenResponse({ refresh_token: undefined, access_token: 'access-2' }));
    const tokens = await refreshClioTokens(CONFIG, 'refresh-existing', fetchMock as unknown as typeof fetch);
    expect(tokens.accessToken).toBe('access-2');
    expect(tokens.refreshToken).toBe('refresh-existing');
  });
});
