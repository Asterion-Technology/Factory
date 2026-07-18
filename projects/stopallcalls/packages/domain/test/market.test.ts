import { describe, expect, it } from 'vitest';
import { MarketError, assertIntakeOpen, isIntakeOpen, isMarketCode } from '../src/market';

const CA = {
  code: 'CA' as const,
  status: 'active' as const,
  regions: ['ON', 'BC'],
  updatedBy: 'test',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

describe('market gating (RAD-17)', () => {
  it('open = active market AND allowlisted region, case-insensitive', () => {
    expect(isIntakeOpen(CA, 'ON')).toBe(true);
    expect(isIntakeOpen(CA, 'on')).toBe(true);
    expect(isIntakeOpen(CA, 'QC')).toBe(false);
    expect(isIntakeOpen({ ...CA, status: 'dormant' }, 'ON')).toBe(false);
  });

  it('assertIntakeOpen names the reason without leaking config', () => {
    expect(() => assertIntakeOpen({ ...CA, status: 'dormant' }, 'ON')).toThrow(MarketError);
    expect(() => assertIntakeOpen(CA, 'QC')).toThrow(/not yet available in QC/);
  });

  it('isMarketCode accepts only known codes', () => {
    expect(isMarketCode('CA')).toBe(true);
    expect(isMarketCode('US')).toBe(true);
    expect(isMarketCode('EU')).toBe(false);
  });
});
