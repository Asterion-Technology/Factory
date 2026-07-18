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
