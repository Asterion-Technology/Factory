// RAD-19: pure transform behind `pnpm agencies:build-seed` — normalized
// per-registry CSVs in seed-data/agencies/ become idempotent upsert SQL for
// the authorized_agencies table. Kept separate from the CLI so the CSV
// parsing, validation, and SQL emission are unit-testable (test/agency-seed).
// Deliberately dependency-free: validation errors name the file/row/column so
// a bad crawl export fails loudly, never half-loads.

import {
  LICENCE_STATUSES,
  agencyCanonicalKey,
  authorizedAgencyId,
  normalizeAgencyName,
  type LicenceStatus,
  type MarketCode,
} from '@stopallcalls/domain';

export const AGENCY_CSV_HEADER = [
  'country',
  'region',
  'name',
  'aliases',
  'licence_number',
  'licence_status',
  'expires_at',
  'phone',
  'email',
  'website',
  'address_line1',
  'address_line2',
  'city',
  'address_region',
  'postal_code',
  'source_registry',
  'source_url',
  'verified_at',
] as const;

export interface AgencySeedRecord {
  id: string;
  canonicalKey: string;
  name: string;
  nameNorm: string;
  aliases: string[];
  aliasesNorm: string;
  country: MarketCode;
  region: string;
  licenceNumber: string | null;
  licenceStatus: LicenceStatus;
  expiresAt: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  addressRegion: string | null;
  postalCode: string | null;
  sourceRegistry: string;
  sourceUrl: string;
  verifiedAt: string;
}

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const BOM = String.fromCharCode(0xfeff);
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

class RowError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`);
    this.name = 'RowError';
  }
}

function opt(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Validate one CSV data row and derive the searchable/id columns. */
export function toSeedRecord(file: string, line: number, cells: string[]): AgencySeedRecord {
  if (cells.length !== AGENCY_CSV_HEADER.length) {
    throw new RowError(file, line, `expected ${AGENCY_CSV_HEADER.length} columns, got ${cells.length}`);
  }
  const col = (name: (typeof AGENCY_CSV_HEADER)[number]) => cells[AGENCY_CSV_HEADER.indexOf(name)];

  const country = (col('country') ?? '').trim().toUpperCase();
  if (country !== 'CA' && country !== 'US') throw new RowError(file, line, `country must be CA or US, got "${country}"`);
  const region = (col('region') ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) throw new RowError(file, line, `region must be a 2-letter code, got "${region}"`);
  const name = (col('name') ?? '').trim();
  if (!name) throw new RowError(file, line, 'name is required');

  const statusRaw = (col('licence_status') ?? '').trim().toLowerCase() || 'unknown';
  if (!(LICENCE_STATUSES as readonly string[]).includes(statusRaw)) {
    throw new RowError(file, line, `licence_status must be one of ${LICENCE_STATUSES.join('|')}, got "${statusRaw}"`);
  }
  const expiresAt = opt(col('expires_at'));
  if (expiresAt && !ISO_DATE.test(expiresAt)) throw new RowError(file, line, `expires_at must be YYYY-MM-DD, got "${expiresAt}"`);
  const verifiedAt = (col('verified_at') ?? '').trim();
  if (!ISO_DATETIME.test(verifiedAt)) {
    throw new RowError(file, line, `verified_at must be an ISO-8601 UTC datetime, got "${verifiedAt}"`);
  }
  const sourceRegistry = (col('source_registry') ?? '').trim();
  const sourceUrl = (col('source_url') ?? '').trim();
  if (!sourceRegistry || !/^https?:\/\//.test(sourceUrl)) {
    throw new RowError(file, line, 'source_registry and a valid source_url are required (provenance is mandatory)');
  }

  const aliases = (col('aliases') ?? '')
    .split('|')
    .map((a) => a.trim())
    .filter(Boolean);
  const licenceNumber = opt(col('licence_number'));

  return {
    id: authorizedAgencyId({ country, region, licenceNumber, name }),
    canonicalKey: agencyCanonicalKey(name),
    name,
    nameNorm: normalizeAgencyName(name),
    aliases,
    aliasesNorm: aliases.map(normalizeAgencyName).join(' '),
    country,
    region,
    licenceNumber,
    licenceStatus: statusRaw as LicenceStatus,
    expiresAt,
    phone: opt(col('phone')),
    email: opt(col('email')),
    website: opt(col('website')),
    addressLine1: opt(col('address_line1')),
    addressLine2: opt(col('address_line2')),
    city: opt(col('city')),
    addressRegion: opt(col('address_region')),
    postalCode: opt(col('postal_code')),
    sourceRegistry,
    sourceUrl,
    verifiedAt,
  };
}

export function parseSeedCsv(file: string, text: string): AgencySeedRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`${file}: empty CSV`);
  const header = rows[0]!.map((h) => h.trim());
  if (header.join(',') !== AGENCY_CSV_HEADER.join(',')) {
    throw new Error(`${file}: header mismatch.\nexpected: ${AGENCY_CSV_HEADER.join(',')}\ngot:      ${header.join(',')}`);
  }
  return rows.slice(1).map((cells, idx) => toSeedRecord(file, idx + 2, cells));
}

function sql(v: string | null): string {
  return v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
}

const UPDATE_COLUMNS = [
  'canonical_key', 'name', 'name_norm', 'aliases_json', 'aliases_norm', 'country', 'region',
  'licence_number', 'licence_status', 'expires_at', 'phone', 'email', 'website',
  'address_line1', 'address_line2', 'city', 'address_region', 'postal_code',
  'source_registry', 'source_url', 'verified_at', 'updated_at',
] as const;

/**
 * Idempotent upsert SQL: rerunning after a registry refresh updates changed
 * rows in place (created_at is preserved; ids are deterministic so intake
 * authorizedAgencyId refs never dangle). Deletions are NOT handled — a
 * delisted agency stays until a prune pass exists (tracked in TODO.md).
 */
export function buildSeedSql(records: AgencySeedRecord[], sources: string[]): string {
  const byId = new Map<string, AgencySeedRecord>();
  for (const r of records) {
    const clash = byId.get(r.id);
    if (clash) {
      throw new Error(
        `duplicate id ${r.id}: "${clash.name}" (${clash.region}) vs "${r.name}" (${r.region}) — ` +
          'same licence number or same name+region; fix the source CSV',
      );
    }
    byId.set(r.id, r);
  }

  const lines: string[] = [
    '-- Generated by `pnpm --filter @stopallcalls/db agencies:build-seed` — DO NOT EDIT.',
    `-- Sources: ${sources.join(', ')}`,
    `-- Rows: ${records.length}. Idempotent: safe to re-apply after registry refreshes.`,
    '-- Apply (human-gated on remote): CI=true pnpm exec wrangler d1 execute <db> [--remote] --file <this file>',
    '',
  ];
  for (const r of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const values = [
      sql(r.id), sql(r.canonicalKey), sql(r.name), sql(r.nameNorm), sql(JSON.stringify(r.aliases)),
      sql(r.aliasesNorm), sql(r.country), sql(r.region), sql(r.licenceNumber), sql(r.licenceStatus),
      sql(r.expiresAt), sql(r.phone), sql(r.email), sql(r.website), sql(r.addressLine1),
      sql(r.addressLine2), sql(r.city), sql(r.addressRegion), sql(r.postalCode),
      sql(r.sourceRegistry), sql(r.sourceUrl), sql(r.verifiedAt), sql(r.verifiedAt), sql(r.verifiedAt),
    ];
    lines.push(
      'INSERT INTO authorized_agencies (id, canonical_key, name, name_norm, aliases_json, aliases_norm, ' +
        'country, region, licence_number, licence_status, expires_at, phone, email, website, address_line1, ' +
        'address_line2, city, address_region, postal_code, source_registry, source_url, verified_at, ' +
        'created_at, updated_at)',
      `VALUES (${values.join(', ')})`,
      `ON CONFLICT(id) DO UPDATE SET ${UPDATE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ')};`,
      '',
    );
  }
  return lines.join('\n');
}
