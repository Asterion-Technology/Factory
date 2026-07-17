import { describe, expect, it } from 'vitest';
import {
  AUTH_LIMITS,
  CODE_TTL_MS,
  InMemoryAuthStore,
  MAX_CODE_ATTEMPTS,
  SESSION_TTL_MS,
  SlidingWindowRateLimiter,
  getVerifiedSession,
  startEmailVerification,
  verifyEmailCode,
} from '../src/index';

const EMAIL = 'consumer@example.test';

function harness() {
  const store = new InMemoryAuthStore();
  const sent: { email: string; code: string }[] = [];
  let clockMs = 1_700_000_000_000;
  const deps = {
    rateLimiter: new SlidingWindowRateLimiter(() => clockMs),
    remoteKey: '203.0.113.1',
    now: () => new Date(clockMs),
    sendCode: async (email: string, code: string) => {
      sent.push({ email, code });
    },
  };
  return {
    store,
    sent,
    deps,
    advance: (ms: number) => {
      clockMs += ms;
    },
  };
}

describe('startEmailVerification (INT-002)', () => {
  it('sends a 6-digit code and stores only a hash', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.code).toMatch(/^\d{6}$/);
    const challenge = await h.store.getLatestChallenge(EMAIL);
    expect(challenge?.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(challenge)).not.toContain(h.sent[0]!.code);
  });

  it('normalizes the email to one consumer key', async () => {
    const h = harness();
    await startEmailVerification(h.store, '  Consumer@Example.TEST ', h.deps);
    expect((await h.store.getLatestChallenge(EMAIL))?.email).toBe(EMAIL);
  });

  it('rate-limits per email (INT-008)', async () => {
    const h = harness();
    for (let i = 0; i < AUTH_LIMITS.startPerEmail.limit; i++) {
      await startEmailVerification(h.store, EMAIL, h.deps);
    }
    await expect(startEmailVerification(h.store, EMAIL, h.deps)).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
    h.advance(AUTH_LIMITS.startPerEmail.windowMs + 1);
    await expect(startEmailVerification(h.store, EMAIL, h.deps)).resolves.toBeUndefined();
  });

  it('rate-limits per IP across emails (INT-008)', async () => {
    const h = harness();
    for (let i = 0; i < AUTH_LIMITS.startPerIp.limit; i++) {
      await startEmailVerification(h.store, `consumer${i}@example.test`, h.deps);
    }
    await expect(startEmailVerification(h.store, 'late@example.test', h.deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('verifyEmailCode (INT-002)', () => {
  it('exchanges the correct code for a session bound to the email', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    const session = await verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps);
    expect(session.email).toBe(EMAIL);
    expect(session.token).toMatch(/^[0-9a-f]{64}$/);
    await expect(getVerifiedSession(h.store, session.token, h.deps.now)).resolves.toMatchObject({ email: EMAIL });
  });

  it('rejects a wrong code without consuming the challenge', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    await expect(verifyEmailCode(h.store, EMAIL, '000000', h.deps)).rejects.toMatchObject({
      status: 401,
      code: 'CODE_INVALID',
    });
    await expect(verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps)).resolves.toBeDefined();
  });

  it('locks the challenge after too many wrong attempts', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      await expect(verifyEmailCode(h.store, EMAIL, '000000', h.deps)).rejects.toMatchObject({
        code: 'CODE_INVALID',
      });
    }
    // Even the correct code is refused once the attempt budget is spent.
    await expect(verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps)).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
    });
  });

  it('rejects an expired code', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    h.advance(CODE_TTL_MS + 1);
    await expect(verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps)).rejects.toMatchObject({
      status: 410,
      code: 'CODE_EXPIRED',
    });
  });

  it('single-use: a consumed code cannot mint a second session', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    await verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps);
    await expect(verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps)).rejects.toMatchObject({
      code: 'CODE_EXPIRED',
    });
  });

  it('rate-limits verification attempts per IP (INT-008)', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    for (let i = 0; i < AUTH_LIMITS.verifyPerIp.limit; i++) {
      await verifyEmailCode(h.store, EMAIL, '000000', h.deps).catch(() => undefined);
    }
    await expect(verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});

describe('getVerifiedSession', () => {
  it('returns null for unknown or expired sessions', async () => {
    const h = harness();
    await startEmailVerification(h.store, EMAIL, h.deps);
    const session = await verifyEmailCode(h.store, EMAIL, h.sent[0]!.code, h.deps);
    await expect(getVerifiedSession(h.store, 'not-a-token', h.deps.now)).resolves.toBeNull();
    h.advance(SESSION_TTL_MS + 1);
    await expect(getVerifiedSession(h.store, session.token, h.deps.now)).resolves.toBeNull();
  });
});
