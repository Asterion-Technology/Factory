import { describe, expect, it } from 'vitest';
import { calculateOrder, validatePricingConfig, type PricingConfig } from '../src/index';

const CONFIG: PricingConfig = {
  baseFeeCents: 9900,
  perAgencyFeeCents: 2500,
  taxRateBps: 1300,
  currency: 'CAD',
};

const AT = '2026-07-18T00:00:00.000Z';

describe('calculateOrder (PAY-001/PAY-002)', () => {
  it('prices base + per-agency with tax, in integer cents', () => {
    const snapshot = calculateOrder(CONFIG, 2, AT);
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.subtotalCents).toBe(9900 + 2 * 2500);
    expect(snapshot.taxCents).toBe(Math.round((14900 * 1300) / 10000)); // 1937
    expect(snapshot.totalCents).toBe(14900 + 1937);
    expect(snapshot.currency).toBe('CAD');
    expect(snapshot.calculatedAt).toBe(AT);
  });

  it('is deterministic for identical inputs', () => {
    expect(calculateOrder(CONFIG, 3, AT)).toEqual(calculateOrder(CONFIG, 3, AT));
  });

  it('handles a zero tax rate without rounding artifacts', () => {
    const snapshot = calculateOrder({ ...CONFIG, taxRateBps: 0 }, 1, AT);
    expect(snapshot.taxCents).toBe(0);
    expect(snapshot.totalCents).toBe(snapshot.subtotalCents);
  });

  it('rejects invalid agency counts and config values', () => {
    expect(() => calculateOrder(CONFIG, 0, AT)).toThrow('agencyCount');
    expect(() => calculateOrder(CONFIG, 1.5, AT)).toThrow('agencyCount');
    expect(() => calculateOrder({ ...CONFIG, baseFeeCents: -1 }, 1, AT)).toThrow('baseFeeCents');
    expect(() => calculateOrder({ ...CONFIG, baseFeeCents: 99.5 }, 1, AT)).toThrow('baseFeeCents');
    expect(() => calculateOrder({ ...CONFIG, taxRateBps: 10001 }, 1, AT)).toThrow('taxRateBps');
    expect(() => validatePricingConfig({ ...CONFIG, currency: 'cad' })).toThrow('currency');
  });
});
