import { pricingConfigSchema } from '@stopallcalls/contracts';
import type { PricingConfig } from '@stopallcalls/domain';

// PAY-001: pricing is configuration, validated on first use and never taken
// from the client. SAC_PRICING (JSON, wrangler var) overrides; the fallback
// is a PLACEHOLDER for dev only — real amounts are an SRS §16 product/counsel
// decision recorded in docs/BUILD_PLAN.md before production.
const DEV_PLACEHOLDER: PricingConfig = {
  baseFeeCents: 9900,
  perAgencyFeeCents: 2500,
  taxRateBps: 1300,
  currency: 'CAD',
};

let cached: PricingConfig | null = null;

export function getPricingConfig(): PricingConfig {
  if (cached) return cached;
  const raw = process.env.SAC_PRICING;
  cached = raw ? pricingConfigSchema.parse(JSON.parse(raw)) : DEV_PLACEHOLDER;
  return cached;
}
