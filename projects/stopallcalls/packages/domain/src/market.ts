// RAD-17: market model. A market is open for intake when its status is
// active AND the consumer's region is on that market's allowlist. Existing
// cases keep the market they were pinned with — flips only affect new intake.

export const MARKET_CODES = ['CA', 'US'] as const;
export type MarketCode = (typeof MARKET_CODES)[number];

export const MARKET_STATUSES = ['active', 'dormant'] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

export interface MarketConfig {
  code: MarketCode;
  status: MarketStatus;
  /** Region (province/state) intake allowlist, uppercase codes. */
  regions: string[];
  updatedBy: string;
  updatedAt: string;
}

export class MarketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketError';
  }
}

export function isMarketCode(v: unknown): v is MarketCode {
  return typeof v === 'string' && (MARKET_CODES as readonly string[]).includes(v);
}

/** Gate for new intake only — never applied retroactively to pinned cases. */
export function isIntakeOpen(market: MarketConfig, region: string): boolean {
  return market.status === 'active' && market.regions.includes(region.toUpperCase());
}

export function assertIntakeOpen(market: MarketConfig, region: string): void {
  if (market.status !== 'active') {
    throw new MarketError(`The ${market.code} market is not accepting new intakes.`);
  }
  if (!market.regions.includes(region.toUpperCase())) {
    throw new MarketError(`Intake is not yet available in ${region.toUpperCase()}.`);
  }
}
