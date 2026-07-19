export type {
  ClioAdapter,
  ClioContactSummary,
  ClioMatterRef,
  EmailAdapter,
  IdentityAdapter,
  IdentityStatus,
  IdentityWebhookParseResult,
  MalwareScanner,
  PaymentAdapter,
  PaymentStatus,
  PdfAdapter,
  SignatureAdapter,
  StorageAdapter,
  TurnstileAdapter,
} from './types';
export { CloudflareTurnstileAdapter } from './turnstile';
export type { ClioOAuthConfig, ClioTokens } from './clio-oauth';
export { buildClioAuthorizeUrl, exchangeClioCode, refreshClioTokens } from './clio-oauth';
export type { RealClioConfig } from './clio';
export { RealClioAdapter } from './clio';
export type { R2BucketLike, R2StorageConfig } from './r2';
export { R2StorageAdapter } from './r2';
export type { ResendEmailConfig } from './resend-email';
export { ResendEmailAdapter } from './resend-email';
export type { DiditConfig } from './didit';
export { DiditIdentityAdapter } from './didit';
export {
  FAKE_MALWARE_MARKER,
  FakeClioAdapter,
  FakeEmailAdapter,
  FakeIdentityAdapter,
  FakeMalwareScanner,
  FakePaymentAdapter,
  FakePdfAdapter,
  FakeSignatureAdapter,
  FakeStorageAdapter,
  FakeTurnstileAdapter,
} from './fakes';
