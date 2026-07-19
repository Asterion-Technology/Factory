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

// Region normalization: the intake form captures free text ("Ontario",
// "Québec", "qc"). Gate decisions must be spelling- and accent-insensitive,
// and an unrecognized region fails CLOSED — for a legal-services funnel a
// typo asks the consumer to correct, it never slips a closed jurisdiction in.
const CA_REGION_NAMES: Record<string, string> = {
  ALBERTA: 'AB', 'BRITISH COLUMBIA': 'BC', MANITOBA: 'MB', 'NEW BRUNSWICK': 'NB',
  'NEWFOUNDLAND AND LABRADOR': 'NL', NEWFOUNDLAND: 'NL', 'NOVA SCOTIA': 'NS',
  'NORTHWEST TERRITORIES': 'NT', NUNAVUT: 'NU', ONTARIO: 'ON',
  'PRINCE EDWARD ISLAND': 'PE', QUEBEC: 'QC', SASKATCHEWAN: 'SK', YUKON: 'YT',
};
const CA_REGION_CODES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

/** "Québec" → "QC", "on" → "ON"; null when unrecognized (caller fails closed). */
export function normalizeCanadianRegion(input: string): string | null {
  const flat = input.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\./g, '');
  if (CA_REGION_CODES.has(flat)) return flat;
  return CA_REGION_NAMES[flat] ?? null;
}
