// PAY-001/PAY-002: config-driven pricing, computed server-side only. Pure and
// deterministic — money is integer cents, tax in basis points, and the caller
// supplies the timestamp so identical inputs always produce identical
// snapshots (the snapshot is persisted on the order for audit).

export interface PricingConfig {
  baseFeeCents: number;
  perAgencyFeeCents: number;
  /** e.g. 1300 = 13% HST. Applied to the subtotal, half-up rounding. */
  taxRateBps: number;
  currency: string;
}

export interface PricingLineItem {
  description: string;
  amountCents: number;
}

export interface PricingSnapshot {
  config: PricingConfig;
  agencyCount: number;
  items: PricingLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  calculatedAt: string;
}

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

function assertMoney(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError(`${name} must be a non-negative integer number of cents.`);
  }
}

export function validatePricingConfig(config: PricingConfig): void {
  assertMoney('baseFeeCents', config.baseFeeCents);
  assertMoney('perAgencyFeeCents', config.perAgencyFeeCents);
  if (!Number.isSafeInteger(config.taxRateBps) || config.taxRateBps < 0 || config.taxRateBps > 10000) {
    throw new PricingError('taxRateBps must be an integer between 0 and 10000.');
  }
  if (!/^[A-Z]{3}$/.test(config.currency)) {
    throw new PricingError('currency must be a 3-letter ISO code.');
  }
}

export function calculateOrder(config: PricingConfig, agencyCount: number, calculatedAt: string): PricingSnapshot {
  validatePricingConfig(config);
  if (!Number.isSafeInteger(agencyCount) || agencyCount < 1) {
    throw new PricingError('agencyCount must be a positive integer.');
  }
  const items: PricingLineItem[] = [
    { description: 'Base service fee', amountCents: config.baseFeeCents },
    ...Array.from({ length: agencyCount }, (_, i) => ({
      description: `Collection agency ${i + 1} of ${agencyCount}`,
      amountCents: config.perAgencyFeeCents,
    })),
  ];
  const subtotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const taxCents = Math.round((subtotalCents * config.taxRateBps) / 10000);
  return {
    config: { ...config },
    agencyCount,
    items,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: config.currency,
    calculatedAt,
  };
}
