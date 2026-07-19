import { describe, expect, it } from 'vitest';
import {
  agencyCanonicalKey,
  agencyMailingAddress,
  authorizedAgencyId,
  normalizeAgencyName,
  rankAgencySearch,
  type AuthorizedAgency,
} from '../src/agency';

const base = (over: Partial<AuthorizedAgency>): AuthorizedAgency => ({
  id: 'aa:CA:ON:x',
  canonicalKey: 'x',
  name: 'X',
  nameNorm: 'x',
  aliases: [],
  aliasesNorm: '',
  country: 'CA',
  region: 'ON',
  licenceNumber: null,
  licenceStatus: 'active',
  expiresAt: null,
  phone: null,
  email: null,
  website: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  addressRegion: null,
  postalCode: null,
  sourceRegistry: 'Test Registry',
  sourceUrl: 'https://registry.example.test',
  verifiedAt: '2026-07-19T00:00:00.000Z',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  ...over,
});

describe('normalizeAgencyName (RAD-19)', () => {
  it('strips diacritics, lowers, collapses punctuation and whitespace', () => {
    expect(normalizeAgencyName('Recouvrements Rivière-Nord Ltée')).toBe('recouvrements riviere nord ltee');
    expect(normalizeAgencyName("D'Amico & Associés Inc.")).toBe('d amico associes inc');
    expect(normalizeAgencyName('  (C.C.A.)  Commercial   Credit ')).toBe('c c a commercial credit');
  });

  it('keeps legal suffixes (they disambiguate firms)', () => {
    expect(normalizeAgencyName('Northwind Ltd.')).not.toBe(normalizeAgencyName('Northwind Inc.'));
  });

  it('produces LIKE-safe output (no % or _ survive)', () => {
    expect(normalizeAgencyName('100%_Recovery %co_')).toBe('100 recovery co');
  });
});

describe('authorizedAgencyId', () => {
  it('is deterministic and prefers licence number over name', () => {
    const a = { country: 'CA' as const, region: 'on', licenceNumber: 'ON-123', name: 'Alpha Ltd.' };
    expect(authorizedAgencyId(a)).toBe('aa:CA:ON:on-123');
    expect(authorizedAgencyId(a)).toBe(authorizedAgencyId({ ...a }));
    expect(authorizedAgencyId({ ...a, licenceNumber: null })).toBe('aa:CA:ON:alpha-ltd');
  });
});

describe('agencyMailingAddress', () => {
  it('composes a single line from present parts only', () => {
    const a = base({ addressLine1: '100 Test St', city: 'Toronto', addressRegion: 'ON', postalCode: 'M5V 0A1' });
    expect(agencyMailingAddress(a)).toBe('100 Test St, Toronto, ON, M5V 0A1');
    expect(agencyMailingAddress(base({}))).toBeNull();
  });
});

describe('rankAgencySearch', () => {
  const rows = [
    base({ id: '1', canonicalKey: agencyCanonicalKey('Alpha Recovery Ltd'), nameNorm: 'alpha recovery ltd', name: 'Alpha Recovery Ltd', region: 'ON' }),
    base({ id: '2', canonicalKey: agencyCanonicalKey('Grand Alpha Collections'), nameNorm: 'grand alpha collections', name: 'Grand Alpha Collections', region: 'BC' }),
    base({ id: '3', canonicalKey: agencyCanonicalKey('Beta Adjusters Inc'), nameNorm: 'beta adjusters inc', name: 'Beta Adjusters Inc', aliasesNorm: 'alpha door collections', region: 'AB' }),
  ];

  it('ranks name prefix > name substring > alias-only', () => {
    const out = rankAgencySearch(rows, 'alpha', { country: 'CA' });
    expect(out.map((a) => a.id)).toEqual(['1', '2', '3']);
  });

  it('boosts the consumer region', () => {
    const out = rankAgencySearch(
      [
        base({ id: 'on', canonicalKey: 'k1', nameNorm: 'northstar credit', region: 'ON' }),
        base({ id: 'bc', canonicalKey: 'k2', nameNorm: 'northstar collections', region: 'BC' }),
      ],
      'northstar',
      { country: 'CA', region: 'bc' },
    );
    expect(out[0]!.id).toBe('bc');
  });

  it('dedupes by canonicalKey preferring the consumer region, then active licence', () => {
    const key = agencyCanonicalKey('Maple Ridge Recovery Ltd');
    const multi = [
      base({ id: 'on', canonicalKey: key, nameNorm: 'maple ridge recovery ltd', region: 'ON' }),
      base({ id: 'ab', canonicalKey: key, nameNorm: 'maple ridge recovery ltd', region: 'AB' }),
    ];
    expect(rankAgencySearch(multi, 'maple', { country: 'CA', region: 'AB' }).map((a) => a.id)).toEqual(['ab']);

    const revokedFirst = [
      base({ id: 'rev', canonicalKey: key, nameNorm: 'maple ridge recovery ltd', region: 'NS', licenceStatus: 'revoked' }),
      base({ id: 'act', canonicalKey: key, nameNorm: 'maple ridge recovery ltd', region: 'ON' }),
    ];
    expect(rankAgencySearch(revokedFirst, 'maple', { country: 'CA' }).map((a) => a.id)).toEqual(['act']);
  });

  it('still returns revoked licensees when they are the only match', () => {
    const out = rankAgencySearch(
      [base({ id: 'r', canonicalKey: 'k', nameNorm: 'shady collections', licenceStatus: 'revoked' })],
      'shady',
      { country: 'CA' },
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.licenceStatus).toBe('revoked');
  });

  it('clamps to limit and returns empty for a query that normalizes away', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      base({ id: `m${i}`, canonicalKey: `k${i}`, nameNorm: `omega ${i} recovery` }),
    );
    expect(rankAgencySearch(many, 'omega', { country: 'CA', limit: 5 })).toHaveLength(5);
    expect(rankAgencySearch(many, 'omega', { country: 'CA' })).toHaveLength(8);
    expect(rankAgencySearch(many, '%%%', { country: 'CA' })).toEqual([]);
  });
});
