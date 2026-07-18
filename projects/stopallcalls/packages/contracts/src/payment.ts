import { z } from 'zod';

// PAY-001: pricing is configuration, validated at startup — never client
// input. Shape mirrors @stopallcalls/domain PricingConfig structurally
// (domain stays dependency-free).
export const pricingConfigSchema = z.object({
  baseFeeCents: z.number().int().nonnegative(),
  perAgencyFeeCents: z.number().int().nonnegative(),
  taxRateBps: z.number().int().min(0).max(10000),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export type PricingConfigInput = z.infer<typeof pricingConfigSchema>;

export const paymentMethodSchema = z.enum(['CARD', 'VISA_DEBIT', 'EMT']);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const checkoutRequestSchema = z.object({
  method: paymentMethodSchema,
});

// PAY-004: provider webhook payloads are runtime-validated before any state
// change; eventId is the replay-protection key.
export const paymentWebhookEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  providerRef: z.string().min(1).max(200),
  status: z.enum(['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUNDED']),
});

export type PaymentWebhookEvent = z.infer<typeof paymentWebhookEventSchema>;

export const emtConfirmRequestSchema = z.object({
  confirmedBy: z.string().trim().min(1).max(200),
});

// IDV-003: identity webhooks are signed, replay-protected, idempotent.
export const identityWebhookEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  providerRef: z.string().min(1).max(200),
  status: z.enum(['PENDING', 'VERIFIED', 'MISMATCH', 'FAILED']),
  // IDV-002: redacted match results only.
  checks: z.record(z.string(), z.enum(['MATCH', 'MISMATCH', 'UNAVAILABLE'])).optional(),
});

export type IdentityWebhookEvent = z.infer<typeof identityWebhookEventSchema>;

export const identityOverrideRequestSchema = z.object({
  overriddenBy: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(2000),
});
