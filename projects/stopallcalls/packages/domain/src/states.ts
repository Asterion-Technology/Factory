// State machines from SRS §4.1/§4.2. Exceptional-state edges not enumerated by
// the SRS are a Phase 0 draft; refine per phase with product/legal sign-off.

export const INTAKE_STATES = [
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
  'NEEDS_INFORMATION',
  'MANUAL_REVIEW',
  'CONFLICT_BLOCKED',
  'PAYMENT_FAILED',
  'CANCELLED',
] as const;

export type IntakeState = (typeof INTAKE_STATES)[number];

const INTAKE_TRANSITIONS: Readonly<Record<IntakeState, readonly IntakeState[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['EVIDENCE_REVIEW', 'NEEDS_INFORMATION', 'CANCELLED'],
  EVIDENCE_REVIEW: ['CONFLICT_REVIEW', 'NEEDS_INFORMATION', 'MANUAL_REVIEW', 'CANCELLED'],
  CONFLICT_REVIEW: ['IDENTITY_REVIEW', 'MANUAL_REVIEW', 'CONFLICT_BLOCKED', 'CANCELLED'],
  IDENTITY_REVIEW: ['RETAINER_PENDING', 'MANUAL_REVIEW', 'CANCELLED'],
  RETAINER_PENDING: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['READY_TO_OPEN', 'PAYMENT_FAILED', 'CANCELLED'],
  READY_TO_OPEN: ['OPENED', 'CANCELLED'],
  OPENED: ['CLOSED'],
  CLOSED: [],
  NEEDS_INFORMATION: ['SUBMITTED', 'EVIDENCE_REVIEW', 'CANCELLED'],
  MANUAL_REVIEW: ['EVIDENCE_REVIEW', 'CONFLICT_REVIEW', 'IDENTITY_REVIEW', 'CONFLICT_BLOCKED', 'CANCELLED'],
  CONFLICT_BLOCKED: ['CLOSED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  CANCELLED: [],
};

export const MATTER_STATES = [
  'MATTER_PENDING',
  'MATTER_CREATED',
  'DRAFT_PENDING',
  'DRAFT_READY',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'DELIVERY_QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'FOLLOW_UP_DUE',
  'CLOSED',
] as const;

export type MatterState = (typeof MATTER_STATES)[number];

const MATTER_TRANSITIONS: Readonly<Record<MatterState, readonly MatterState[]>> = {
  MATTER_PENDING: ['MATTER_CREATED'],
  MATTER_CREATED: ['DRAFT_PENDING'],
  DRAFT_PENDING: ['DRAFT_READY'],
  DRAFT_READY: ['IN_REVIEW'],
  IN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED'],
  CHANGES_REQUESTED: ['DRAFT_PENDING'],
  // WF-005 / LTR-007: any content change after approval reverts to IN_REVIEW.
  APPROVED: ['DELIVERY_QUEUED', 'IN_REVIEW'],
  DELIVERY_QUEUED: ['SENT'],
  SENT: ['DELIVERED', 'BOUNCED'],
  DELIVERED: ['FOLLOW_UP_DUE', 'CLOSED'],
  BOUNCED: ['DELIVERY_QUEUED', 'CLOSED'],
  FOLLOW_UP_DUE: ['CLOSED'],
  CLOSED: [],
};

// WF-001: the single server-side transition guard. Clients request transitions;
// they never assign states.
export function canTransition(from: IntakeState, to: IntakeState): boolean;
export function canTransition(from: MatterState, to: MatterState): boolean;
export function canTransition(from: string, to: string): boolean {
  const intake = (INTAKE_TRANSITIONS as Record<string, readonly string[]>)[from];
  if (intake && (INTAKE_STATES as readonly string[]).includes(to)) {
    return intake.includes(to);
  }
  const matter = (MATTER_TRANSITIONS as Record<string, readonly string[]>)[from];
  if (matter && (MATTER_STATES as readonly string[]).includes(to)) {
    return matter.includes(to);
  }
  return false;
}

// WF-002: every applied transition must be recorded with this shape.
export interface TransitionRecord<S extends string> {
  actorId: string;
  occurredAt: string;
  priorState: S;
  newState: S;
  reason: string;
  correlationId: string;
  artifactVersion?: string;
}
