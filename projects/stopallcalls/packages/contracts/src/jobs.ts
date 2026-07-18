import { z } from 'zod';

// SRS §7 queue envelope: every job carries an idempotency key (WF-003) and a
// correlation id (ARC-010). Consumers runtime-validate before acting.
export const jobMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('FOLLOW_UP_SWEEP'),
    idempotencyKey: z.string().min(1),
    correlationId: z.string().min(1),
  }),
  // Placeholders for work moving off the request path (TODO.md): evidence
  // scanning and post-submit conflict checks enqueue with these shapes.
  z.object({
    type: z.literal('EVIDENCE_SCAN'),
    idempotencyKey: z.string().min(1),
    correlationId: z.string().min(1),
    evidenceId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('CONFLICT_CHECK'),
    idempotencyKey: z.string().min(1),
    correlationId: z.string().min(1),
    intakeId: z.string().uuid(),
  }),
]);

export type JobMessage = z.infer<typeof jobMessageSchema>;
