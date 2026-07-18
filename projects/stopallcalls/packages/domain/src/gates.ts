// Non-negotiable workflow gates (SRS §1.2). Gates are domain code, never UI
// conditions; each evaluation must be auditable.

export const GATES = [
  'EVIDENCE',
  'CONFLICT',
  'IDENTITY',
  'RETAINER',
  'PAYMENT',
  'LEGAL_APPROVAL',
] as const;

export type Gate = (typeof GATES)[number];

export type GateStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'MANUAL_REVIEW';

export interface GateResult {
  gate: Gate;
  status: GateStatus;
  decidedBy?: string;
  decidedAt?: string;
  reason?: string;
}

export type GateSnapshot = Readonly<Record<Gate, GateResult>>;

// Gates that only an authorized human may pass (SRS CLIO-003, LTR-008).
export const HUMAN_ONLY_GATES: readonly Gate[] = ['CONFLICT', 'LEGAL_APPROVAL'];

export function allGatesPassed(snapshot: GateSnapshot, required: readonly Gate[] = GATES): boolean {
  return required.every((gate) => snapshot[gate]?.status === 'PASSED');
}

// PAY-006 + WF gates: matters may only be created once everything up to and
// including payment has passed.
export const MATTER_CREATION_GATES: readonly Gate[] = [
  'EVIDENCE',
  'CONFLICT',
  'IDENTITY',
  'RETAINER',
  'PAYMENT',
];

export function canCreateMatters(snapshot: GateSnapshot): boolean {
  return allGatesPassed(snapshot, MATTER_CREATION_GATES);
}

export function canSendLetter(snapshot: GateSnapshot): boolean {
  return allGatesPassed(snapshot, GATES);
}
