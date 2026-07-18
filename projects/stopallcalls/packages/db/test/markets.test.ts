import { describe, expect, it } from 'vitest';
import { InMemoryMarketStore } from '../src/markets';

describe('MarketStore (RAD-17)', () => {
  it('seeds CA active (12 regions, no QC) and US dormant', async () => {
    const store = new InMemoryMarketStore();
    const ca = await store.get('CA');
    expect(ca!.status).toBe('active');
    expect(ca!.regions).toHaveLength(12);
    expect(ca!.regions).not.toContain('QC');
    expect((await store.get('US'))!.status).toBe('dormant');
  });

  it('update flips status and records who/when; returns a copy', async () => {
    const store = new InMemoryMarketStore();
    const us = await store.update('US', { status: 'active', regions: ['NY'] }, 'admin@test', '2026-08-01T00:00:00.000Z');
    expect(us!.status).toBe('active');
    expect(us!.updatedBy).toBe('admin@test');
    us!.regions.push('XX');
    expect((await store.get('US'))!.regions).toEqual(['NY']);
  });
});
