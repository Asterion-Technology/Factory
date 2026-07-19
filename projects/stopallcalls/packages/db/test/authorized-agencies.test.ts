import { describe, expect, it } from 'vitest';
import { InMemoryAuthorizedAgencyStore, defaultAuthorizedAgencies } from '../src/authorized-agencies';

describe('AuthorizedAgencyStore (RAD-19)', () => {
  it('seed is clearly fictitious and covers the interesting shapes', () => {
    const rows = defaultAuthorizedAgencies();
    expect(rows.every((r) => !r.email || r.email.endsWith('.example.test'))).toBe(true);
    expect(rows.filter((r) => r.canonicalKey === rows[0]!.canonicalKey)).toHaveLength(2);
    expect(rows.some((r) => r.licenceStatus === 'revoked')).toBe(true);
    expect(rows.some((r) => r.country === 'US')).toBe(true);
  });

  it('searches case/diacritic-insensitively and filters by country', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    const hits = await store.search('RIVIÈRE', { country: 'CA' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.name).toBe('Recouvrements Rivière-Nord Ltée');
    expect(await store.search('liberty falls', { country: 'CA' })).toEqual([]);
    expect(await store.search('liberty falls', { country: 'US' })).toHaveLength(1);
  });

  it('dedupes the multi-province firm to the consumer region row', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    const hits = await store.search('maple ridge', { country: 'CA', region: 'AB' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.region).toBe('AB');
    expect(hits[0]!.id).toContain(':AB:');
  });

  it('matches aliases', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    const hits = await store.search('west coast', { country: 'CA' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.name).toBe('Cascadia Credit Solutions Inc.');
  });

  it('surfaces revoked licensees rather than hiding them', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    const hits = await store.search('harbourview', { country: 'CA' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.licenceStatus).toBe('revoked');
  });

  it('get returns a copy by id, null when unknown', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    const [hit] = await store.search('prairie sky', { country: 'CA' });
    const got = await store.get(hit!.id);
    expect(got!.name).toBe('Prairie Sky Receivables Corp.');
    got!.aliases.push('mutated');
    expect((await store.get(hit!.id))!.aliases).toEqual([]);
    expect(await store.get('aa:CA:ON:nope')).toBeNull();
  });

  it('returns empty for blank/degenerate queries', async () => {
    const store = new InMemoryAuthorizedAgencyStore();
    expect(await store.search('   ', { country: 'CA' })).toEqual([]);
    expect(await store.search('%_', { country: 'CA' })).toEqual([]);
  });
});
