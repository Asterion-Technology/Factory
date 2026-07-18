// Phase 4 (SRS §4 / PAY-001..006): payment lifecycle. Card/Visa-debit flows
// arrive via verified provider webhooks; EMT is confirmed only by billing
// staff (PAY-005). Terminal states never transition.

export const PAYMENT_STATES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'AWAITING_EMT',
  'EMT_CONFIRMED',
  'FAILED',
  'CANCELLED',
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

const PAYMENT_TRANSITIONS: Readonly<Record<PaymentState, readonly PaymentState[]>> = {
  PENDING: ['AUTHORIZED', 'AWAITING_EMT', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PAID', 'FAILED', 'CANCELLED'],
  AWAITING_EMT: ['EMT_CONFIRMED', 'CANCELLED'],
  FAILED: ['PENDING', 'CANCELLED'],
  PAID: [],
  EMT_CONFIRMED: [],
  CANCELLED: [],
};

// Payments have their own guard: state names overlap with the intake machine
// (PENDING/CANCELLED), so they must never share canTransition's lookup.
export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// PAY-006: the payment gate passes only in these states — no matter creation
// or letter sending otherwise.
export const PAYMENT_GATE_STATES: readonly PaymentState[] = ['AUTHORIZED', 'PAID', 'EMT_CONFIRMED'];

export function paymentGatePassed(state: PaymentState): boolean {
  return PAYMENT_GATE_STATES.includes(state);
}
