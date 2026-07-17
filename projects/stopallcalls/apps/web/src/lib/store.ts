import {
  InMemoryAuthStore,
  InMemoryEvidenceStore,
  InMemoryIntakeStore,
  SlidingWindowRateLimiter,
  type AuthStore,
  type EvidenceStore,
  type IntakeStore,
} from '@stopallcalls/db';
import {
  CloudflareTurnstileAdapter,
  FakeEmailAdapter,
  FakeMalwareScanner,
  FakeStorageAdapter,
  FakeTurnstileAdapter,
  type EmailAdapter,
  type MalwareScanner,
  type StorageAdapter,
  type TurnstileAdapter,
} from '@stopallcalls/integrations';

// Dev-only persistence: survive Next.js HMR by pinning singletons to
// globalThis. D1-backed stores and real adapters replace these at Cloudflare
// provisioning (DEV-003).
const INTAKE_KEY = Symbol.for('stopallcalls.intakeStore');
const AUTH_KEY = Symbol.for('stopallcalls.authStore');
const EVIDENCE_KEY = Symbol.for('stopallcalls.evidenceStore');
const LIMITER_KEY = Symbol.for('stopallcalls.rateLimiter');
const EMAIL_KEY = Symbol.for('stopallcalls.emailAdapter');
const TURNSTILE_KEY = Symbol.for('stopallcalls.turnstileAdapter');
const STORAGE_KEY = Symbol.for('stopallcalls.storageAdapter');
const SCANNER_KEY = Symbol.for('stopallcalls.malwareScanner');
const DEV_CODES_KEY = Symbol.for('stopallcalls.devCodes');

type Singletons = {
  [INTAKE_KEY]?: IntakeStore;
  [AUTH_KEY]?: AuthStore;
  [EVIDENCE_KEY]?: EvidenceStore;
  [LIMITER_KEY]?: SlidingWindowRateLimiter;
  [EMAIL_KEY]?: EmailAdapter;
  [TURNSTILE_KEY]?: TurnstileAdapter;
  [STORAGE_KEY]?: StorageAdapter;
  [SCANNER_KEY]?: MalwareScanner;
  [DEV_CODES_KEY]?: Map<string, string>;
};

const g = globalThis as Singletons;

export function getIntakeStore(): IntakeStore {
  g[INTAKE_KEY] ??= new InMemoryIntakeStore();
  return g[INTAKE_KEY];
}

export function getAuthStore(): AuthStore {
  g[AUTH_KEY] ??= new InMemoryAuthStore();
  return g[AUTH_KEY];
}

export function getRateLimiter(): SlidingWindowRateLimiter {
  g[LIMITER_KEY] ??= new SlidingWindowRateLimiter();
  return g[LIMITER_KEY];
}

export function getEvidenceStore(): EvidenceStore {
  g[EVIDENCE_KEY] ??= new InMemoryEvidenceStore();
  return g[EVIDENCE_KEY];
}

// The R2-presigning adapter replaces the fake at deploy; the PUT /api/uploads
// dev sink only operates when the fake is active.
export function getStorageAdapter(): StorageAdapter {
  g[STORAGE_KEY] ??= new FakeStorageAdapter();
  return g[STORAGE_KEY];
}

export function getMalwareScanner(): MalwareScanner {
  g[SCANNER_KEY] ??= new FakeMalwareScanner();
  return g[SCANNER_KEY];
}

export function getEmailAdapter(): EmailAdapter {
  g[EMAIL_KEY] ??= new FakeEmailAdapter();
  return g[EMAIL_KEY];
}

// Real siteverify when the secret is configured (INT-008); fake otherwise
// (DEV-003 default, and what E2E runs against).
export function getTurnstileAdapter(): TurnstileAdapter {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  g[TURNSTILE_KEY] ??= secret ? new CloudflareTurnstileAdapter(secret) : new FakeTurnstileAdapter();
  return g[TURNSTILE_KEY];
}

// E2E-only escape hatch: verification codes are otherwise unobservable with
// the fake email adapter. Both functions are inert unless the server was
// launched with SAC_E2E_EXPOSE_CODES=1 (playwright.config.ts webServer env) —
// never set that flag in a deployed environment.
const codesExposed = (): boolean => process.env.SAC_E2E_EXPOSE_CODES === '1';

export function recordDevCode(email: string, code: string): void {
  if (!codesExposed()) return;
  g[DEV_CODES_KEY] ??= new Map();
  g[DEV_CODES_KEY].set(email, code);
}

export function getDevCode(email: string): string | null {
  if (!codesExposed()) return null;
  return g[DEV_CODES_KEY]?.get(email) ?? null;
}
