import { describe, expect, it } from 'vitest';
import { CA_TAX_TABLE, TaxError, taxForProvince } from '../src/tax-ca';

describe('taxForProvince (RAD-17 Q1 granular CA table)', () => {
  it('covers all 13 provinces and territories', () => {
    expect(Object.keys(CA_TAX_TABLE)).toHaveLength(13);
  });

  it('ON: 13% HST on 12400 = 1612', () => {
    const { taxCents, breakdown } = taxForProvince(12_400, 'ON');
    expect(taxCents).toBe(1_612);
    expect(breakdown).toHaveLength(1);
  });

  it('QC: GST + QST computed separately, half-up (12400 → 620 + 1237 = 1857)', () => {
    const { taxCents, breakdown } = taxForProvince(12_400, 'QC');
    expect(breakdown.map((b) => b.amountCents)).toEqual([620, 1_237]); // 1236.9 rounds up
    expect(taxCents).toBe(1_857);
  });

  it('BC: GST 5 + PST 7 as separate lines', () => {
    const { breakdown } = taxForProvince(10_000, 'bc');
    expect(breakdown.map((b) => b.amountCents)).toEqual([500, 700]);
  });

  it('NS uses the 14% rate', () => {
    expect(taxForProvince(10_000, 'NS').taxCents).toBe(1_400);
  });

  it('rejects unknown provinces and invalid subtotals', () => {
    expect(() => taxForProvince(100, 'ZZ')).toThrow(TaxError);
    expect(() => taxForProvince(-1, 'ON')).toThrow(TaxError);
    expect(() => taxForProvince(1.5, 'ON')).toThrow(TaxError);
  });
});
