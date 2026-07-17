export type { IntakeRecord, IntakeStore, StoredAgency, SubmittedSnapshot } from './types';
export { InMemoryIntakeStore } from './memory';
export {
  ServiceError,
  addAgency,
  createOrResumeIntake,
  removeAgency,
  saveProfile,
  submitIntake,
  toClientIntake,
} from './service';
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
