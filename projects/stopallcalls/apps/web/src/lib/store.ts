import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  D1AuthStore,
  D1ClioConnectionStore,
  D1ClioMappingStore,
  D1ConflictCheckStore,
  D1EvidenceStore,
  D1IdentityStore,
  D1IntakeStore,
  D1MatterStore,
  D1OrderStore,
  D1PaymentStore,
  D1RetainerSignatureStore,
  D1RetainerVersionStore,
  InMemoryAuthStore,
  InMemoryClioConnectionStore,
  InMemoryClioMappingStore,
  InMemoryConflictCheckStore,
  InMemoryEvidenceStore,
  InMemoryIdentityStore,
  InMemoryIntakeStore,
  InMemoryMatterStore,
  InMemoryOrderStore,
  InMemoryPaymentStore,
  InMemoryRetainerSignatureStore,
  InMemoryRetainerVersionStore,
  SlidingWindowRateLimiter,
  type AuthStore,
  type ClioConnectionStore,
  type ClioMappingStore,
  type ConflictCheckStore,
  type D1Like,
  type EvidenceStore,
  type IdentityStore,
  type IntakeStore,
  type MatterStore,
  type OrderStore,
  type PaymentStore,
  type RetainerSignatureStore,
  type RetainerVersionStore,
} from '@stopallcalls/db';
import type {
  ApprovalStore,
  AuditStore,
  DeliveryStore,
  LetterTemplateStore,
  LetterVersionStore,
  TaskStore,
} from '@stopallcalls/db';
import {
  D1ApprovalStore,
  D1AuditStore,
  D1DeliveryStore,
  D1LetterTemplateStore,
  D1LetterVersionStore,
  D1TaskStore,
  InMemoryApprovalStore,
  InMemoryAuditStore,
  InMemoryDeliveryStore,
  InMemoryLetterTemplateStore,
  InMemoryLetterVersionStore,
  InMemoryTaskStore,
} from '@stopallcalls/db';
import {
  FakeIdentityAdapter,
  FakePaymentAdapter,
  FakePdfAdapter,
  FakeSignatureAdapter,
} from '@stopallcalls/integrations';
import {
  CloudflareTurnstileAdapter,
  FakeEmailAdapter,
  ResendEmailAdapter,
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
const ORDER_KEY = Symbol.for('stopallcalls.orderStore');
const PAYMENT_KEY = Symbol.for('stopallcalls.paymentStore');
const IDENTITY_KEY = Symbol.for('stopallcalls.identityStore');
const RETAINER_VERSION_KEY = Symbol.for('stopallcalls.retainerVersionStore');
const RETAINER_SIGNATURE_KEY = Symbol.for('stopallcalls.retainerSignatureStore');
const PAYMENT_ADAPTER_KEY = Symbol.for('stopallcalls.paymentAdapter');
const IDENTITY_ADAPTER_KEY = Symbol.for('stopallcalls.identityAdapter');
const SIGNATURE_ADAPTER_KEY = Symbol.for('stopallcalls.signatureAdapter');
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
  [ORDER_KEY]?: OrderStore;
  [PAYMENT_KEY]?: PaymentStore;
  [IDENTITY_KEY]?: IdentityStore;
  [RETAINER_VERSION_KEY]?: RetainerVersionStore;
  [RETAINER_SIGNATURE_KEY]?: RetainerSignatureStore;
  [PAYMENT_ADAPTER_KEY]?: FakePaymentAdapter;
  [IDENTITY_ADAPTER_KEY]?: FakeIdentityAdapter;
  [SIGNATURE_ADAPTER_KEY]?: FakeSignatureAdapter;
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

// Phase 4 stores (migration 0003), same env switch as the rest.
export function getOrderStore(): OrderStore {
  const cf = cloudflareEnv();
  g[ORDER_KEY] ??= cf ? new D1OrderStore(cf.DB) : new InMemoryOrderStore();
  return g[ORDER_KEY];
}

export function getPaymentStore(): PaymentStore {
  const cf = cloudflareEnv();
  g[PAYMENT_KEY] ??= cf ? new D1PaymentStore(cf.DB) : new InMemoryPaymentStore();
  return g[PAYMENT_KEY];
}

export function getIdentityStore(): IdentityStore {
  const cf = cloudflareEnv();
  g[IDENTITY_KEY] ??= cf ? new D1IdentityStore(cf.DB) : new InMemoryIdentityStore();
  return g[IDENTITY_KEY];
}

export function getRetainerVersionStore(): RetainerVersionStore {
  const cf = cloudflareEnv();
  g[RETAINER_VERSION_KEY] ??= cf ? new D1RetainerVersionStore(cf.DB) : new InMemoryRetainerVersionStore();
  return g[RETAINER_VERSION_KEY];
}

export function getRetainerSignatureStore(): RetainerSignatureStore {
  const cf = cloudflareEnv();
  g[RETAINER_SIGNATURE_KEY] ??= cf ? new D1RetainerSignatureStore(cf.DB) : new InMemoryRetainerSignatureStore();
  return g[RETAINER_SIGNATURE_KEY];
}

// Phase 5 stores (letters), D1-backed since migration 0004.
const LETTER_TEMPLATE_KEY = Symbol.for('stopallcalls.letterTemplateStore');
const LETTER_VERSION_KEY = Symbol.for('stopallcalls.letterVersionStore');
const APPROVAL_KEY = Symbol.for('stopallcalls.approvalStore');
const DELIVERY_KEY = Symbol.for('stopallcalls.deliveryStore');
const TASK_KEY = Symbol.for('stopallcalls.taskStore');
const PDF_ADAPTER_KEY = Symbol.for('stopallcalls.pdfAdapter');

const g5 = globalThis as {
  [LETTER_TEMPLATE_KEY]?: LetterTemplateStore;
  [LETTER_VERSION_KEY]?: LetterVersionStore;
  [APPROVAL_KEY]?: ApprovalStore;
  [DELIVERY_KEY]?: DeliveryStore;
  [TASK_KEY]?: TaskStore;
  [PDF_ADAPTER_KEY]?: FakePdfAdapter;
};

export function getLetterTemplateStore(): LetterTemplateStore {
  const cf = cloudflareEnv();
  g5[LETTER_TEMPLATE_KEY] ??= cf ? new D1LetterTemplateStore(cf.DB) : new InMemoryLetterTemplateStore();
  return g5[LETTER_TEMPLATE_KEY];
}

export function getLetterVersionStore(): LetterVersionStore {
  const cf = cloudflareEnv();
  g5[LETTER_VERSION_KEY] ??= cf ? new D1LetterVersionStore(cf.DB) : new InMemoryLetterVersionStore();
  return g5[LETTER_VERSION_KEY];
}

export function getApprovalStore(): ApprovalStore {
  const cf = cloudflareEnv();
  g5[APPROVAL_KEY] ??= cf ? new D1ApprovalStore(cf.DB) : new InMemoryApprovalStore();
  return g5[APPROVAL_KEY];
}

export function getDeliveryStore(): DeliveryStore {
  const cf = cloudflareEnv();
  g5[DELIVERY_KEY] ??= cf ? new D1DeliveryStore(cf.DB) : new InMemoryDeliveryStore();
  return g5[DELIVERY_KEY];
}

export function getTaskStore(): TaskStore {
  const cf = cloudflareEnv();
  g5[TASK_KEY] ??= cf ? new D1TaskStore(cf.DB) : new InMemoryTaskStore();
  return g5[TASK_KEY];
}

export function getPdfAdapter(): FakePdfAdapter {
  g5[PDF_ADAPTER_KEY] ??= new FakePdfAdapter();
  return g5[PDF_ADAPTER_KEY];
}

// Phase 6 (DATA-004): append-only audit trail; audit_events is in the baseline
// schema, so the D1 store needs no migration.
const AUDIT_KEY = Symbol.for('stopallcalls.auditStore');
const g6 = globalThis as { [AUDIT_KEY]?: AuditStore };

export function getAuditStore(): AuditStore {
  const cf = cloudflareEnv();
  g6[AUDIT_KEY] ??= cf ? new D1AuditStore(cf.DB) : new InMemoryAuditStore();
  return g6[AUDIT_KEY];
}

// Phase 4 provider adapters: fakes only (DEV-003) — real provider selection
// (payments/IDV/e-signature) is an SRS §16 human decision; wire sandbox
// adapters behind env switches once chosen.
export function getPaymentAdapter(): FakePaymentAdapter {
  g[PAYMENT_ADAPTER_KEY] ??= new FakePaymentAdapter();
  return g[PAYMENT_ADAPTER_KEY];
}

export function getIdentityAdapter(): FakeIdentityAdapter {
  g[IDENTITY_ADAPTER_KEY] ??= new FakeIdentityAdapter();
  return g[IDENTITY_ADAPTER_KEY];
}

export function getSignatureAdapter(): FakeSignatureAdapter {
  g[SIGNATURE_ADAPTER_KEY] ??= new FakeSignatureAdapter();
  return g[SIGNATURE_ADAPTER_KEY];
}

// RAD-18: real Resend adapter when the secret is configured; fake otherwise
// (DEV-003 default, and what E2E runs against). Mirrors the Turnstile rule.
export function getEmailAdapter(): EmailAdapter {
  const apiKey = process.env.RESEND_API_KEY;
  g[EMAIL_KEY] ??= apiKey ? new ResendEmailAdapter({ apiKey }) : new FakeEmailAdapter();
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
