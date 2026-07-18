export type { IntakeRecord, IntakeStore, StoredAgency, SubmittedSnapshot } from './types';
export { InMemoryIntakeStore } from './memory';
export type { D1Like, D1PreparedLike } from './d1';
export {
  D1AuthStore,
  D1ClioMappingStore,
  D1ConflictCheckStore,
  D1EvidenceStore,
  D1IntakeStore,
  D1MatterStore,
} from './d1';
export {
  ServiceError,
  addAgency,
  createOrResumeIntake,
  duplicateAgency,
  getOwnedIntake,
  removeAgency,
  saveProfile,
  submitIntake,
  toClientIntake,
  updateAgency,
} from './service';
export type {
  CustodyEvent,
  EvidenceRecord,
  EvidenceScanStatus,
  EvidenceStore,
  FinalizeDeps,
} from './evidence';
export {
  InMemoryEvidenceStore,
  finalizeEvidenceUpload,
  listEvidence,
  removeEvidence,
  requestEvidenceUpload,
  toClientEvidence,
} from './evidence';
export type {
  ClioContactHit,
  ClioMappingStore,
  ConflictCheckRecord,
  ConflictCheckStore,
  ConflictDisposition,
  ConflictSearchClio,
  MatterRecord,
  MatterStore,
  ProvisioningClio,
  ProvisioningStores,
} from './clio';
export {
  InMemoryClioMappingStore,
  InMemoryConflictCheckStore,
  InMemoryMatterStore,
  provisionClioForIntake,
  recordConflictDisposition,
  runConflictCheck,
} from './clio';
export type { ClioConnectionRecord, ClioConnectionStore } from './clio-connection';
export {
  D1ClioConnectionStore,
  InMemoryClioConnectionStore,
  decryptSecret,
  encryptSecret,
} from './clio-connection';
export type { OrderRecord, OrderStore } from './orders';
export { InMemoryOrderStore, createOrderForIntake } from './orders';
export type {
  HostedCheckoutProvider,
  PaymentRecord,
  PaymentStore,
  WebhookVerifier,
} from './payments';
export {
  InMemoryPaymentStore,
  applyPaymentWebhook,
  confirmEmtPayment,
  paymentGateFromRecords,
  startEmtPayment,
  startHostedPayment,
} from './payments';
export type { IdentityRecord, IdentityRecordStatus, IdentitySessionProvider, IdentityStore } from './identity';
export {
  InMemoryIdentityStore,
  applyIdentityWebhook,
  identityGateFromRecord,
  recordIdentityOverride,
  startIdentityVerification,
} from './identity';
export type {
  RetainerSignatureRecord,
  RetainerSignatureStore,
  RetainerVersionRecord,
  RetainerVersionStore,
  SignatureProvider,
} from './retainer';
export {
  InMemoryRetainerSignatureStore,
  InMemoryRetainerVersionStore,
  completeRetainerSignature,
  publishRetainerVersion,
  requestRetainerSignature,
  retainerGateFromRecord,
} from './retainer';
export type { AuthChallenge, AuthDeps, AuthStore, ConsumerSession, StartVerificationDeps } from './auth';
export {
  AUTH_LIMITS,
  CODE_TTL_MS,
  InMemoryAuthStore,
  MAX_CODE_ATTEMPTS,
  SESSION_TTL_MS,
  SlidingWindowRateLimiter,
  getVerifiedSession,
  startEmailVerification,
  verifyEmailCode,
} from './auth';
