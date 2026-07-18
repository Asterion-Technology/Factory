import { describe, expect, it } from 'vitest';
import { PAYMENT_STATES, canTransitionPayment, paymentGatePassed } from '../src/index';

describe('payment state machine (PAY-003..006)', () => {
  it('allows the card flow: PENDING → AUTHORIZED → PAID', () => {
    expect(canTransitionPayment('PENDING', 'AUTHORIZED')).toBe(true);
    expect(canTransitionPayment('AUTHORIZED', 'PAID')).toBe(true);
  });

  it('allows the EMT flow: PENDING → AWAITING_EMT → EMT_CONFIRMED (PAY-005)', () => {
    expect(canTransitionPayment('PENDING', 'AWAITING_EMT')).toBe(true);
    expect(canTransitionPayment('AWAITING_EMT', 'EMT_CONFIRMED')).toBe(true);
    // EMT never routes through card states.
    expect(canTransitionPayment('AWAITING_EMT', 'AUTHORIZED')).toBe(false);
  });

  it('allows retry after failure and keeps terminal states terminal', () => {
    expect(canTransitionPayment('FAILED', 'PENDING')).toBe(true);
    for (const to of PAYMENT_STATES) {
      expect(canTransitionPayment('PAID', to)).toBe(false);
      expect(canTransitionPayment('EMT_CONFIRMED', to)).toBe(false);
      expect(canTransitionPayment('CANCELLED', to)).toBe(false);
    }
  });

  it('never skips straight to a paid state', () => {
    expect(canTransitionPayment('PENDING', 'PAID')).toBe(false);
    expect(canTransitionPayment('PENDING', 'EMT_CONFIRMED')).toBe(false);
  });

  it('passes the payment gate only for AUTHORIZED / PAID / EMT_CONFIRMED (PAY-006)', () => {
    expect(PAYMENT_STATES.filter(paymentGatePassed)).toEqual(['AUTHORIZED', 'PAID', 'EMT_CONFIRMED']);
  });
});
