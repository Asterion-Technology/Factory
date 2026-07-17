import { ServiceError } from './service';

// INT-002: email + one-time code verification producing a resumable consumer
// session. Codes are stored hashed; plaintext exists only in the outbound
// email. The verified (normalized) email is the durable consumer key that
// intakes are owned by, so sessions resume across devices.

export interface AuthChallenge {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  consumedAt: string | null;
  createdAt: string;
}

export interface ConsumerSession {
  token: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface AuthStore {
  insertChallenge(challenge: AuthChallenge): Promise<void>;
  /** Latest unconsumed challenge for the email, or null. Expiry is checked by the service. */
  getLatestChallenge(email: string): Promise<AuthChallenge | null>;
  updateChallenge(challenge: AuthChallenge): Promise<void>;
  insertSession(session: ConsumerSession): Promise<void>;
  getSession(token: string): Promise<ConsumerSession | null>;
}

export class InMemoryAuthStore implements AuthStore {
  private challenges = new Map<string, AuthChallenge>();
  private sessions = new Map<string, ConsumerSession>();

  async insertChallenge(challenge: AuthChallenge): Promise<void> {
    this.challenges.set(challenge.id, structuredClone(challenge));
  }

  async getLatestChallenge(email: string): Promise<AuthChallenge | null> {
    let latest: AuthChallenge | null = null;
    for (const c of this.challenges.values()) {
      if (c.email !== email || c.consumedAt) continue;
      if (!latest || c.createdAt > latest.createdAt) latest = c;
    }
    return latest ? structuredClone(latest) : null;
  }

  async updateChallenge(challenge: AuthChallenge): Promise<void> {
    this.challenges.set(challenge.id, structuredClone(challenge));
  }

  async insertSession(session: ConsumerSession): Promise<void> {
    this.sessions.set(session.token, structuredClone(session));
  }

  async getSession(token: string): Promise<ConsumerSession | null> {
    const session = this.sessions.get(token);
    return session ? structuredClone(session) : null;
  }
}

// INT-008: server-side abuse control. In-memory sliding window; the D1/DO
// backed limiter replaces this at Cloudflare provisioning behind the same
// shape. Injectable clock keeps tests deterministic.
export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private readonly nowMs: () => number = () => Date.now()) {}

  allow(key: string, limit: number, windowMs: number): boolean {
    const now = this.nowMs();
    const kept = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (kept.length >= limit) {
      this.hits.set(key, kept);
      return false;
    }
    kept.push(now);
    this.hits.set(key, kept);
    return true;
  }
}

const MINUTE = 60 * 1000;
export const CODE_TTL_MS = 10 * MINUTE;
export const SESSION_TTL_MS = 30 * 24 * 60 * MINUTE;
export const MAX_CODE_ATTEMPTS = 5;

export const AUTH_LIMITS = {
  startPerEmail: { limit: 5, windowMs: 15 * MINUTE },
  startPerIp: { limit: 10, windowMs: 15 * MINUTE },
  verifyPerIp: { limit: 20, windowMs: 15 * MINUTE },
} as const;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateCode(): string {
  // Rejection sampling keeps the 6-digit distribution uniform.
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= 4_000_000_000);
  return String(value % 1_000_000).padStart(6, '0');
}

function randomSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface AuthDeps {
  rateLimiter: SlidingWindowRateLimiter;
  /** Client IP (or a stable stand-in) for per-IP limits. */
  remoteKey: string;
  now?: () => Date;
}

export interface StartVerificationDeps extends AuthDeps {
  /** Transport is injected so this package never imports a provider adapter. */
  sendCode: (email: string, code: string) => Promise<void>;
}

export async function startEmailVerification(
  store: AuthStore,
  email: string,
  deps: StartVerificationDeps,
): Promise<void> {
  const norm = email.trim().toLowerCase();
  const { rateLimiter } = deps;
  if (
    !rateLimiter.allow(`start:email:${norm}`, AUTH_LIMITS.startPerEmail.limit, AUTH_LIMITS.startPerEmail.windowMs) ||
    !rateLimiter.allow(`start:ip:${deps.remoteKey}`, AUTH_LIMITS.startPerIp.limit, AUTH_LIMITS.startPerIp.windowMs)
  ) {
    throw new ServiceError(429, 'RATE_LIMITED', 'Too many codes requested. Please wait and try again.');
  }
  const now = deps.now?.() ?? new Date();
  const code = generateCode();
  const id = crypto.randomUUID();
  await store.insertChallenge({
    id,
    email: norm,
    codeHash: await sha256Hex(`${id}:${code}`),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    consumedAt: null,
    createdAt: now.toISOString(),
  });
  await deps.sendCode(norm, code);
}

export async function verifyEmailCode(
  store: AuthStore,
  email: string,
  code: string,
  deps: AuthDeps,
): Promise<ConsumerSession> {
  const norm = email.trim().toLowerCase();
  if (
    !deps.rateLimiter.allow(`verify:ip:${deps.remoteKey}`, AUTH_LIMITS.verifyPerIp.limit, AUTH_LIMITS.verifyPerIp.windowMs)
  ) {
    throw new ServiceError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.');
  }
  const now = deps.now?.() ?? new Date();
  const challenge = await store.getLatestChallenge(norm);
  if (!challenge || challenge.expiresAt <= now.toISOString()) {
    throw new ServiceError(410, 'CODE_EXPIRED', 'That code is no longer valid. Request a new one.');
  }
  if (challenge.attempts >= MAX_CODE_ATTEMPTS) {
    throw new ServiceError(429, 'TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }
  challenge.attempts += 1;
  await store.updateChallenge(challenge);
  const matches = (await sha256Hex(`${challenge.id}:${code}`)) === challenge.codeHash;
  if (!matches) {
    throw new ServiceError(401, 'CODE_INVALID', 'That code is incorrect. Check the email we sent you.');
  }
  challenge.consumedAt = now.toISOString();
  await store.updateChallenge(challenge);
  const session: ConsumerSession = {
    token: randomSessionToken(),
    email: norm,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  await store.insertSession(session);
  return session;
}

export async function getVerifiedSession(
  store: AuthStore,
  token: string,
  now: () => Date = () => new Date(),
): Promise<ConsumerSession | null> {
  const session = await store.getSession(token);
  if (!session || session.expiresAt <= now().toISOString()) return null;
  return session;
}
