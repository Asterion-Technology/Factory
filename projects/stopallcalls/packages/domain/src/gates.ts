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

export interface GateEvaluationInput {
  /** Evidence gate passes only when every uploaded file has a CLEAN scan. */
  evidence: { total: number; clean: number };
  /** Human-recorded disposition (CLIO-003); null while undecided. */
  conflictDisposition: 'CLEAR' | 'POSSIBLE_CONFLICT' | 'CONFLICT_FOUND' | null;
  // Phase 4 providers (RAD-6) report these; absent means PENDING, so matter
  // creation stays blocked until identity/retainer/payment actually pass.
  identity?: GateStatus;
  retainer?: GateStatus;
  payment?: GateStatus;
  legalApproval?: GateStatus;
}

/** Evaluates the real gate snapshot from recorded facts — never from UI state. */
export function evaluateGates(input: GateEvaluationInput): GateSnapshot {
  const conflict: GateStatus =
    input.conflictDisposition === 'CLEAR'
      ? 'PASSED'
      : input.conflictDisposition === 'CONFLICT_FOUND'
        ? 'FAILED'
        : input.conflictDisposition === 'POSSIBLE_CONFLICT'
          ? 'MANUAL_REVIEW'
          : 'PENDING';
  const evidence: GateStatus =
    input.evidence.total > 0 && input.evidence.clean === input.evidence.total ? 'PASSED' : 'PENDING';
  const statuses: Record<Gate, GateStatus> = {
    EVIDENCE: evidence,
    CONFLICT: conflict,
    IDENTITY: input.identity ?? 'PENDING',
    RETAINER: input.retainer ?? 'PENDING',
    PAYMENT: input.payment ?? 'PENDING',
    LEGAL_APPROVAL: input.legalApproval ?? 'PENDING',
  };
  return Object.fromEntries(GATES.map((gate) => [gate, { gate, status: statuses[gate] }])) as Record<
    Gate,
    GateResult
  >;
}
