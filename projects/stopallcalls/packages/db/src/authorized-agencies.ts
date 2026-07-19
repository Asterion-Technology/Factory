// RAD-19: authorized collection agency registry store. Read-only at runtime —
// rows are loaded/refreshed by the seed pipeline (packages/db/seed-data),
// never written by the app. Two implementations like every other store:
// fictitious-seeded in-memory for local dev/E2E, D1 (migration 0006) deployed.
// Both delegate matching/ranking/dedupe to rankAgencySearch so results are
// identical for identical data (asserted in the D1 contract tests).

import {
  agencyCanonicalKey,
  authorizedAgencyId,
  normalizeAgencyName,
  rankAgencySearch,
  type AgencySearchOptions,
  type AuthorizedAgency,
  type LicenceStatus,
  type MarketCode,
} from '@stopallcalls/domain';
import type { D1Like } from './d1';

export interface AuthorizedAgencyStore {
  search(query: string, opts: AgencySearchOptions): Promise<AuthorizedAgency[]>;
  get(id: string): Promise<AuthorizedAgency | null>;
}

interface SeedInput {
  name: string;
  aliases?: string[];
  country: MarketCode;
  region: string;
  licenceNumber?: string;
  licenceStatus?: LicenceStatus;
  expiresAt?: string;
  phone?: string;
  email?: string;
  website?: string;
  addressLine1?: string;
  city?: string;
  postalCode?: string;
}

const SEED_AT = '2026-07-19T00:00:00.000Z';

function seedAgency(s: SeedInput): AuthorizedAgency {
  return {
    id: authorizedAgencyId(s),
    canonicalKey: agencyCanonicalKey(s.name),
    name: s.name,
    nameNorm: normalizeAgencyName(s.name),
    aliases: s.aliases ?? [],
    aliasesNorm: (s.aliases ?? []).map(normalizeAgencyName).join(' '),
    country: s.country,
    region: s.region,
    licenceNumber: s.licenceNumber ?? null,
    licenceStatus: s.licenceStatus ?? 'active',
    expiresAt: s.expiresAt ?? null,
    phone: s.phone ?? null,
    email: s.email ?? null,
    website: s.website ?? null,
    addressLine1: s.addressLine1 ?? null,
    addressLine2: null,
    city: s.city ?? null,
    addressRegion: s.city ? s.region : null,
    postalCode: s.postalCode ?? null,
    sourceRegistry: 'Fictitious Test Registry',
    sourceUrl: 'https://registry.example.test',
    verifiedAt: SEED_AT,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
}

// Clearly fictitious (repo rule: never real data in fixtures). Covers the
// shapes the UI and ranking care about: a multi-province firm (canonical
// dedupe), a revoked licence (badge, never hidden), aliases, diacritics,
// and a dormant-market US row.
export function defaultAuthorizedAgencies(): AuthorizedAgency[] {
  return [
    seedAgency({
      name: 'Maple Ridge Recovery Services Ltd.',
      country: 'CA',
      region: 'ON',
      licenceNumber: 'ON-1000001',
      expiresAt: '2027-03-31',
      phone: '1-800-555-0101',
      email: 'contact@mapleridge.example.test',
      website: 'https://mapleridge.example.test',
      addressLine1: '100 Test Street, Suite 400',
      city: 'Toronto',
      postalCode: 'M5V 0A1',
    }),
    seedAgency({
      name: 'Maple Ridge Recovery Services Ltd.',
      country: 'CA',
      region: 'AB',
      licenceNumber: 'AB-2000002',
      phone: '1-800-555-0101',
      city: 'Calgary',
    }),
    seedAgency({
      name: 'Cascadia Credit Solutions Inc.',
      aliases: ['West Coast Recovery'],
      country: 'CA',
      region: 'BC',
      licenceNumber: 'BC-3000003',
      phone: '1-800-555-0102',
      email: 'info@cascadia.example.test',
      city: 'Vancouver',
    }),
    seedAgency({
      name: 'Recouvrements Rivière-Nord Ltée',
      country: 'CA',
      region: 'QC',
      licenceNumber: 'QC-4000004',
      city: 'Montréal',
    }),
    seedAgency({
      name: 'Harbourview Collections Ltd.',
      country: 'CA',
      region: 'NS',
      licenceNumber: 'NS-5000005',
      licenceStatus: 'revoked',
      city: 'Halifax',
    }),
    seedAgency({
      name: 'Prairie Sky Receivables Corp.',
      country: 'CA',
      region: 'SK',
      licenceNumber: 'SK-6000006',
      city: 'Saskatoon',
    }),
    seedAgency({
      name: 'Liberty Falls Recovery LLC',
      country: 'US',
      region: 'NY',
      licenceNumber: 'NY-7000007',
      city: 'Albany',
    }),
  ];
}

// Search must never scan unbounded: both stores pre-filter candidates
// (substring on normalized name/aliases), then rank. D1 caps candidates —
// plenty for a reference table where a query rarely matches dozens of firms.
const D1_CANDIDATE_CAP = 50;

export class InMemoryAuthorizedAgencyStore implements AuthorizedAgencyStore {
  private readonly rows: AuthorizedAgency[];

  constructor(rows: AuthorizedAgency[] = defaultAuthorizedAgencies()) {
    this.rows = rows;
  }

  async search(query: string, opts: AgencySearchOptions): Promise<AuthorizedAgency[]> {
    const q = normalizeAgencyName(query);
    if (!q) return [];
    const candidates = this.rows.filter(
      (a) => a.country === opts.country && (a.nameNorm.includes(q) || a.aliasesNorm.includes(q)),
    );
    return rankAgencySearch(candidates, query, opts).map((a) => ({ ...a, aliases: [...a.aliases] }));
  }

  async get(id: string): Promise<AuthorizedAgency | null> {
    const a = this.rows.find((r) => r.id === id);
    return a ? { ...a, aliases: [...a.aliases] } : null;
  }
}

interface AgencyRow {
  id: string;
  canonical_key: string;
  name: string;
  name_norm: string;
  aliases_json: string;
  aliases_norm: string;
  country: string;
  region: string;
  licence_number: string | null;
  licence_status: string;
  expires_at: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  address_region: string | null;
  postal_code: string | null;
  source_registry: string;
  source_url: string;
  verified_at: string;
  created_at: string;
  updated_at: string;
}

function toAgency(row: AgencyRow): AuthorizedAgency {
  return {
    id: row.id,
    canonicalKey: row.canonical_key,
    name: row.name,
    nameNorm: row.name_norm,
    aliases: JSON.parse(row.aliases_json) as string[],
    aliasesNorm: row.aliases_norm,
    country: row.country as MarketCode,
    region: row.region,
    licenceNumber: row.licence_number,
    licenceStatus: row.licence_status as LicenceStatus,
    expiresAt: row.expires_at,
    phone: row.phone,
    email: row.email,
    website: row.website,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    addressRegion: row.address_region,
    postalCode: row.postal_code,
    sourceRegistry: row.source_registry,
    sourceUrl: row.source_url,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class D1AuthorizedAgencyStore implements AuthorizedAgencyStore {
  constructor(private readonly db: D1Like) {}

  async search(query: string, opts: AgencySearchOptions): Promise<AuthorizedAgency[]> {
    const q = normalizeAgencyName(query);
    if (!q) return [];
    // LIKE special characters are stripped by normalization except '%'/'_' —
    // normalization maps them to spaces, so q is LIKE-safe by construction.
    const pattern = `%${q}%`;
    const { results } = await this.db
      .prepare(
        'SELECT * FROM authorized_agencies WHERE country = ? AND (name_norm LIKE ? OR aliases_norm LIKE ?) LIMIT ?',
      )
      .bind(opts.country, pattern, pattern, D1_CANDIDATE_CAP)
      .all<AgencyRow>();
    return rankAgencySearch((results ?? []).map(toAgency), query, opts);
  }

  async get(id: string): Promise<AuthorizedAgency | null> {
    const row = await this.db
      .prepare('SELECT * FROM authorized_agencies WHERE id = ?')
      .bind(id)
      .first<AgencyRow>();
    return row ? toAgency(row) : null;
  }
}
