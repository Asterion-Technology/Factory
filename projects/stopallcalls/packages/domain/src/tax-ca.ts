// RAD-17 Q1: per-province Canadian sales tax on legal services — the most
// granular defensible model: place of supply = the consumer's home province,
// each component computed separately with half-up rounding (CRA practice),
// rates in parts-per-million because QST (9.975%) does not fit basis points.
//
// BEST-GUESS DEFAULTS (owner-directed 2026-07-18) — an accountant must
// validate rates and the legal-services PST treatment before production.
// BC/SK/MB provincial taxes apply to legal services; QST applies on the
// subtotal (no tax-on-tax since 2013). Quebec intake itself is gated
// separately (RAD-17 Q3: fast-follow).

export interface TaxComponent {
  label: string;
  ratePpm: number;
}

export interface ProvinceTaxRule {
  province: string;
  components: TaxComponent[];
}

const PPM = 1_000_000;

export const CA_TAX_TABLE: Record<string, TaxComponent[]> = {
  AB: [{ label: 'GST 5%', ratePpm: 50_000 }],
  BC: [{ label: 'GST 5%', ratePpm: 50_000 }, { label: 'PST 7%', ratePpm: 70_000 }],
  MB: [{ label: 'GST 5%', ratePpm: 50_000 }, { label: 'RST 7%', ratePpm: 70_000 }],
  NB: [{ label: 'HST 15%', ratePpm: 150_000 }],
  NL: [{ label: 'HST 15%', ratePpm: 150_000 }],
  NS: [{ label: 'HST 14%', ratePpm: 140_000 }],
  NT: [{ label: 'GST 5%', ratePpm: 50_000 }],
  NU: [{ label: 'GST 5%', ratePpm: 50_000 }],
  ON: [{ label: 'HST 13%', ratePpm: 130_000 }],
  PE: [{ label: 'HST 15%', ratePpm: 150_000 }],
  QC: [{ label: 'GST 5%', ratePpm: 50_000 }, { label: 'QST 9.975%', ratePpm: 99_750 }],
  SK: [{ label: 'GST 5%', ratePpm: 50_000 }, { label: 'PST 6%', ratePpm: 60_000 }],
  YT: [{ label: 'GST 5%', ratePpm: 50_000 }],
};

export class TaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxError';
  }
}

export interface TaxBreakdownLine {
  label: string;
  ratePpm: number;
  amountCents: number;
}

/** Half-up per component on the subtotal; deterministic for identical input. */
export function taxForProvince(subtotalCents: number, province: string): { taxCents: number; breakdown: TaxBreakdownLine[] } {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new TaxError('subtotalCents must be a non-negative integer number of cents.');
  }
  const components = CA_TAX_TABLE[province.toUpperCase()];
  if (!components) throw new TaxError(`No Canadian tax rule for province "${province}".`);
  const breakdown = components.map((c) => ({
    label: c.label,
    ratePpm: c.ratePpm,
    amountCents: Math.round((subtotalCents * c.ratePpm) / PPM),
  }));
  return { taxCents: breakdown.reduce((s, l) => s + l.amountCents, 0), breakdown };
}
