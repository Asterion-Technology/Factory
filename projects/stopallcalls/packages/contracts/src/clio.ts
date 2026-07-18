import { z } from 'zod';

// CLIO-003: a human disposition always names the reviewer and the reasoning.
export const conflictDispositionRequestSchema = z.object({
  disposition: z.enum(['CLEAR', 'POSSIBLE_CONFLICT', 'CONFLICT_FOUND']),
  reviewedBy: z.string().trim().min(1).max(200),
  rationale: z.string().trim().min(1).max(2000),
});

export type ConflictDispositionRequest = z.infer<typeof conflictDispositionRequestSchema>;
