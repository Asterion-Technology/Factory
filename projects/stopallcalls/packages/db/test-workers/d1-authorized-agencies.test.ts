import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { D1AuthorizedAgencyStore, InMemoryAuthorizedAgencyStore } from '../src/authorized-agencies';
import {
  agencyCanonicalKey,
  authorizedAgencyId,
  normalizeAgencyName,
  type AuthorizedAgency,
} from '@stopallcalls/domain';

// RAD-19 contract tests: the D1 store against real D1 (miniflare SQLite) with
// migration 0006 applied, asserting result parity with the in-memory store
// for identical rows. Fixture names carry a per-run token so tests stay
// independent in the shared database. All data fictitious.

const runToken = crypto.randomUUID().slice(0, 8);
const AT = '2026-07-19T00:00:00.000Z';

function fixture(over: {
  name: string;
  region: string;
  country?: 'CA' | 'US';
  licenceNumber?: string;
  licenceStatus?: AuthorizedAgency['licenceStatus'];
  aliases?: string[];
  phone?: string;
}): AuthorizedAgency {
  const name = `${over.name} ${runToken}`;
  const country = over.country ?? 'CA';
  const licenceNumber = over.licenceNumber ? `${over.licenceNumber}-${runToken}` : null;
  return {
    id: authorizedAgencyId({ country, region: over.region, licenceNumber, name }),
    canonicalKey: agencyCanonicalKey(name),
    name,
    nameNorm: normalizeAgencyName(name),
    aliases: over.aliases ?? [],
    aliasesNorm: (over.aliases ?? []).map((a) => normalizeAgencyName(`${a} ${runToken}`)).join(' '),
    country,
    region: over.region,
    licenceNumber,
    licenceStatus: over.licenceStatus ?? 'active',
    expiresAt: '2027-03-31',
    phone: over.phone ?? null,
    email: null,
    website: null,
    addressLine1: '1 Fictional Way',
    addressLine2: null,
    city: 'Sampleville',
    addressRegion: over.region,
    postalCode: 'A1A 1A1',
    sourceRegistry: 'Fictitious Test Registry',
    sourceUrl: 'https://registry.example.test',
    verifiedAt: AT,
    createdAt: AT,
    updatedAt: AT,
  };
}

async function insert(a: AuthorizedAgency): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO authorized_agencies (
      id, canonical_key, name, name_norm, aliases_json, aliases_norm, country, region,
      licence_number, licence_status, expires_at, phone, email, website,
      address_line1, address_line2, city, address_region, postal_code,
      source_registry, source_url, verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      a.id, a.canonicalKey, a.name, a.nameNorm, JSON.stringify(a.aliases), a.aliasesNorm,
      a.country, a.region, a.licenceNumber, a.licenceStatus, a.expiresAt, a.phone, a.email,
      a.website, a.addressLine1, a.addressLine2, a.city, a.addressRegion, a.postalCode,
      a.sourceRegistry, a.sourceUrl, a.verifiedAt, a.createdAt, a.updatedAt,
    )
    .run();
}

describe('D1AuthorizedAgencyStore (RAD-19)', () => {
  it('search + get round-trip with all columns mapped', async () => {
    const store = new D1AuthorizedAgencyStore(env.DB);
    const row = fixture({ name: 'Roundtrip Recovery Ltd', region: 'ON', licenceNumber: 'ON-RT', phone: '1-800-555-0142' });
    await insert(row);

    const hits = await store.search(`roundtrip recovery ltd ${runToken}`, { country: 'CA' });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual(row);
    expect(await store.get(row.id)).toEqual(row);
    expect(await store.get(`aa:CA:ON:missing-${runToken}`)).toBeNull();
  });

  it('matches parity with the in-memory store on ranking, dedupe, and aliases', async () => {
    const rows = [
      fixture({ name: 'Parity Alpha Collections', region: 'ON', licenceNumber: 'ON-PA' }),
      fixture({ name: 'Parity Alpha Collections', region: 'AB', licenceNumber: 'AB-PA' }),
      fixture({ name: 'Grand Parity Alpha Group', region: 'BC', licenceNumber: 'BC-GP' }),
      fixture({ name: 'Unrelated Adjusters Inc', region: 'SK', licenceNumber: 'SK-UA', aliases: ['Parity Alpha Door'] }),
    ];
    for (const r of rows) await insert(r);

    const d1 = new D1AuthorizedAgencyStore(env.DB);
    const mem = new InMemoryAuthorizedAgencyStore(rows);
    const query = `parity alpha`;
    const opts = { country: 'CA' as const, region: 'AB', limit: 10 };

    const [d1Hits, memHits] = [await d1.search(query, opts), await mem.search(query, opts)];
    expect(d1Hits.map((a) => a.id)).toEqual(memHits.map((a) => a.id));
    // Multi-province firm deduped to the consumer's region; alias match last.
    expect(d1Hits[0]!.region).toBe('AB');
    expect(d1Hits.at(-1)!.name).toContain('Unrelated Adjusters');
  });

  it('enforces the partial-unique licence index', async () => {
    const a = fixture({ name: 'Unique Licence Ltd', region: 'NS', licenceNumber: 'NS-UL' });
    await insert(a);
    const dup = { ...fixture({ name: 'Different Name Corp', region: 'NS' }), licenceNumber: a.licenceNumber };
    await expect(insert(dup)).rejects.toThrow(/UNIQUE/i);
    // Null licence numbers do not collide (partial index).
    await insert(fixture({ name: 'No Licence One', region: 'NS' }));
    await insert(fixture({ name: 'No Licence Two', region: 'NS' }));
  });

  it('filters by country and rejects degenerate queries', async () => {
    const us = fixture({ name: 'Stateside Parity Recovery LLC', region: 'NY', country: 'US', licenceNumber: 'NY-SP' });
    await insert(us);
    const store = new D1AuthorizedAgencyStore(env.DB);
    expect(await store.search(`stateside parity`, { country: 'CA' })).toEqual([]);
    expect((await store.search(`stateside parity`, { country: 'US' })).map((a) => a.id)).toEqual([us.id]);
    expect(await store.search('%_', { country: 'CA' })).toEqual([]);
  });
});
