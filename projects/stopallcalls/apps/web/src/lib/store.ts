import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  D1AuthStore,
  D1ClioConnectionStore,
  D1ClioMappingStore,
  D1ConflictCheckStore,
  D1EvidenceStore,
  D1IntakeStore,
  D1MatterStore,
  InMemoryAuthStore,
  InMemoryClioConnectionStore,
  InMemoryClioMappingStore,
  InMemoryConflictCheckStore,
  InMemoryEvidenceStore,
  InMemoryIntakeStore,
  InMemoryMatterStore,
  SlidingWindowRateLimiter,
  type AuthStore,
  type ClioConnectionStore,
  type ClioMappingStore,
  type ConflictCheckStore,
  type D1Like,
  type EvidenceStore,
  type IntakeStore,
  type MatterStore,
} from '@stopallcalls/db';
import {
  CloudflareTurnstileAdapter,
  FakeEmailAdapter,
  FakeMalwareScanner,
  FakeStorageAdapter,
  FakeTurnstileAdapter,
  R2StorageAdapter,
  type EmailAdapter,
  type MalwareScanner,
  type R2BucketLike,
  type StorageAdapter,
  type TurnstileAdapter,
} from '@stopallcalls/integrations';

// Backend selection (DEV-003): SAC_BACKEND=cloudflare (set in wrangler vars)
// switches persistence to the D1/R2 bindings; anything else — local dev,
// tests, E2E — keeps the deterministic in-memory fakes. Singletons pin to
// globalThis to survive Next dev HMR; on Workers they are per-isolate.

interface CloudflareEnv {
  DB: D1Like;
  EVIDENCE_BUCKET: R2BucketLike;
  SAC_ACCOUNT_ID: string;
  SAC_EVIDENCE_BUCKET_NAME: string;
  // Wrangler secrets (R2 SigV4 signing pair for presigned uploads).
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

function cloudflareEnv(): CloudflareEnv | null {
  if (process.env.SAC_BACKEND !== 'cloudflare') return null;
  return getCloudflareContext().env as unknown as CloudflareEnv;
}
const INTAKE_KEY = Symbol.for('stopallcalls.intakeStore');
const AUTH_KEY = Symbol.for('stopallcalls.authStore');
const EVIDENCE_KEY = Symbol.for('stopallcalls.evidenceStore');
const LIMITER_KEY = Symbol.for('stopallcalls.rateLimiter');
const EMAIL_KEY = Symbol.for('stopallcalls.emailAdapter');
const TURNSTILE_KEY = Symbol.for('stopallcalls.turnstileAdapter');
const STORAGE_KEY = Symbol.for('stopallcalls.storageAdapter');
const SCANNER_KEY = Symbol.for('stopallcalls.malwareScanner');
const CLIO_CONNECTION_KEY = Symbol.for('stopallcalls.clioConnectionStore');
const CONFLICT_KEY = Symbol.for('stopallcalls.conflictCheckStore');
const MATTER_KEY = Symbol.for('stopallcalls.matterStore');
const CLIO_MAPPING_KEY = Symbol.for('stopallcalls.clioMappingStore');
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
  [CLIO_CONNECTION_KEY]?: ClioConnectionStore;
  [CONFLICT_KEY]?: ConflictCheckStore;
  [MATTER_KEY]?: MatterStore;
  [CLIO_MAPPING_KEY]?: ClioMappingStore;
  [DEV_CODES_KEY]?: Map<string, string>;
};

const g = globalThis as Singletons;

export function getIntakeStore(): IntakeStore {
  const cf = cloudflareEnv();
  g[INTAKE_KEY] ??= cf ? new D1IntakeStore(cf.DB) : new InMemoryIntakeStore();
  return g[INTAKE_KEY];
}

export function getAuthStore(): AuthStore {
  const cf = cloudflareEnv();
  g[AUTH_KEY] ??= cf ? new D1AuthStore(cf.DB) : new InMemoryAuthStore();
  return g[AUTH_KEY];
}

export function getRateLimiter(): SlidingWindowRateLimiter {
  g[LIMITER_KEY] ??= new SlidingWindowRateLimiter();
  return g[LIMITER_KEY];
}

export function getEvidenceStore(): EvidenceStore {
  const cf = cloudflareEnv();
  g[EVIDENCE_KEY] ??= cf ? new D1EvidenceStore(cf.DB) : new InMemoryEvidenceStore();
  return g[EVIDENCE_KEY];
}

// R2 presigning when deployed; the PUT /api/uploads dev sink only operates
// when the fake is active (it duck-types on the fake's putObject).
export function getStorageAdapter(): StorageAdapter {
  const cf = cloudflareEnv();
  if (cf) {
    if (!cf.R2_ACCESS_KEY_ID || !cf.R2_SECRET_ACCESS_KEY) {
      // Fail closed with an actionable server-side message (never sent to clients).
      throw new Error('R2 signing secrets missing: set R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY wrangler secrets');
    }
    g[STORAGE_KEY] ??= new R2StorageAdapter({
      bucket: cf.EVIDENCE_BUCKET,
      accountId: cf.SAC_ACCOUNT_ID,
      bucketName: cf.SAC_EVIDENCE_BUCKET_NAME,
      accessKeyId: cf.R2_ACCESS_KEY_ID,
      secretAccessKey: cf.R2_SECRET_ACCESS_KEY,
    });
    return g[STORAGE_KEY];
  }
  g[STORAGE_KEY] ??= new FakeStorageAdapter();
  return g[STORAGE_KEY];
}

export function getMalwareScanner(): MalwareScanner {
  g[SCANNER_KEY] ??= new FakeMalwareScanner();
  return g[SCANNER_KEY];
}

export function getClioConnectionStore(): ClioConnectionStore {
  const cf = cloudflareEnv();
  g[CLIO_CONNECTION_KEY] ??= cf ? new D1ClioConnectionStore(cf.DB) : new InMemoryClioConnectionStore();
  return g[CLIO_CONNECTION_KEY];
}

export function getConflictCheckStore(): ConflictCheckStore {
  const cf = cloudflareEnv();
  g[CONFLICT_KEY] ??= cf ? new D1ConflictCheckStore(cf.DB) : new InMemoryConflictCheckStore();
  return g[CONFLICT_KEY];
}

export function getMatterStore(): MatterStore {
  const cf = cloudflareEnv();
  g[MATTER_KEY] ??= cf ? new D1MatterStore(cf.DB) : new InMemoryMatterStore();
  return g[MATTER_KEY];
}

export function getClioMappingStore(): ClioMappingStore {
  const cf = cloudflareEnv();
  g[CLIO_MAPPING_KEY] ??= cf ? new D1ClioMappingStore(cf.DB) : new InMemoryClioMappingStore();
  return g[CLIO_MAPPING_KEY];
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
