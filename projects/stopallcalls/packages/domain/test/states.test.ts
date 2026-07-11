import { describe, expect, it } from 'vitest';
import {
  GATES,
  INTAKE_STATES,
  allGatesPassed,
  canCreateMatters,
  canSendLetter,
  canTransition,
  type GateResult,
  type GateSnapshot,
} from '../src/index';

describe('intake state machine (SRS §4.1)', () => {
  it('allows the happy path in order', () => {
    const path = [
      'DRAFT',
      'SUBMITTED',
      'EVIDENCE_REVIEW',
      'CONFLICT_REVIEW',
      'IDENTITY_REVIEW',
      'RETAINER_PENDING',
      'PAYMENT_PENDING',
      'READY_TO_OPEN',
      'OPENED',
      'CLOSED',
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping gates (WF-001)', () => {
    expect(canTransition('DRAFT', 'OPENED')).toBe(false);
    expect(canTransition('SUBMITTED', 'PAYMENT_PENDING')).toBe(false);
    expect(canTransition('EVIDENCE_REVIEW', 'READY_TO_OPEN')).toBe(false);
  });

  it('routes exceptions correctly', () => {
    expect(canTransition('CONFLICT_REVIEW', 'CONFLICT_BLOCKED')).toBe(true);
    expect(canTransition('CONFLICT_BLOCKED', 'OPENED')).toBe(false);
    expect(canTransition('PAYMENT_PENDING', 'PAYMENT_FAILED')).toBe(true);
    expect(canTransition('PAYMENT_FAILED', 'PAYMENT_PENDING')).toBe(true);
    expect(canTransition('IDENTITY_REVIEW', 'MANUAL_REVIEW')).toBe(true);
  });

  it('treats CLOSED and CANCELLED as terminal', () => {
    for (const to of INTAKE_STATES) {
      expect(canTransition('CLOSED', to)).toBe(false);
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
  });
});

describe('matter/letter state machine (SRS §4.2)', () => {
  it('requires review before approval and approval before delivery', () => {
    expect(canTransition('DRAFT_READY', 'IN_REVIEW')).toBe(true);
    expect(canTransition('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'DELIVERY_QUEUED')).toBe(true);
    expect(canTransition('DRAFT_READY', 'APPROVED')).toBe(false);
    expect(canTransition('DRAFT_READY', 'SENT')).toBe(false);
    expect(canTransition('DRAFT_PENDING', 'DELIVERY_QUEUED')).toBe(false);
  });

  it('invalidates approval on content change (WF-005 / LTR-007)', () => {
    expect(canTransition('APPROVED', 'IN_REVIEW')).toBe(true);
  });

  it('handles bounce and retry without shortcuts', () => {
    expect(canTransition('SENT', 'BOUNCED')).toBe(true);
    expect(canTransition('BOUNCED', 'DELIVERY_QUEUED')).toBe(true);
    expect(canTransition('BOUNCED', 'SENT')).toBe(false);
  });
});

describe('gates (SRS §1.2)', () => {
  const snapshot = (passed: readonly string[]): GateSnapshot =>
    Object.fromEntries(
      GATES.map((gate) => [
        gate,
        { gate, status: passed.includes(gate) ? 'PASSED' : 'PENDING' } satisfies GateResult,
      ]),
    ) as unknown as GateSnapshot;

  it('blocks matter creation until all pre-payment gates pass (PAY-006)', () => {
    expect(canCreateMatters(snapshot(['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER']))).toBe(false);
    expect(canCreateMatters(snapshot(['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT']))).toBe(true);
  });

  it('blocks sending without legal approval (LTR-008)', () => {
    const allButApproval = ['EVIDENCE', 'CONFLICT', 'IDENTITY', 'RETAINER', 'PAYMENT'];
    expect(canSendLetter(snapshot(allButApproval))).toBe(false);
    expect(canSendLetter(snapshot([...allButApproval, 'LEGAL_APPROVAL']))).toBe(true);
    expect(allGatesPassed(snapshot([...GATES]))).toBe(true);
  });
});
