// RAD-19: authorized collection agency registry model. Licensing is
// per-jurisdiction (provincial in Canada, state-level in the US), so the
// grain is one record per (agency, jurisdiction licence); canonicalKey
// groups the same firm across jurisdictions for lookup dedupe. Pure helpers
// only — shared by the seed generator, both store implementations, and tests.

import type { MarketCode } from './market';

export const LICENCE_STATUSES = ['active', 'expired', 'suspended', 'revoked', 'unknown'] as const;
export type LicenceStatus = (typeof LICENCE_STATUSES)[number];

export interface AuthorizedAgency {
  /** Deterministic: `aa:{country}:{region}:{slug}` — stable across data refreshes. */
  id: string;
  canonicalKey: string;
  /** Registered/legal name exactly as published by the registry. */
  name: string;
  nameNorm: string;
  /** Trade / operating / bilingual names (display forms). */
  aliases: string[];
  /** Space-joined normalized aliases so substring search covers them. */
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
  /** When this row was last confirmed against the source registry. */
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

// DATA-003: searchable values live in normalized form. Legal suffixes
// (Ltd/Inc/Ltée) stay — they disambiguate firms; substring matching already
// makes queries suffix-insensitive.
export function normalizeAgencyName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function agencyCanonicalKey(legalName: string): string {
  return normalizeAgencyName(legalName);
}

function agencySlug(input: string): string {
  return normalizeAgencyName(input).replace(/ /g, '-');
}

/** Stable across refreshes so intake `authorizedAgencyId` refs never dangle. */
export function authorizedAgencyId(input: {
  country: MarketCode;
  region: string;
  licenceNumber?: string | null;
  name: string;
}): string {
  const key = input.licenceNumber?.trim() ? input.licenceNumber : input.name;
  return `aa:${input.country}:${input.region.toUpperCase()}:${agencySlug(key)}`;
}

/** Single-line form matching the intake `agencyMailingAddress` field. */
export function agencyMailingAddress(a: AuthorizedAgency): string | null {
  const parts = [a.addressLine1, a.addressLine2, a.city, a.addressRegion, a.postalCode].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? parts.join(', ') : null;
}

export interface AgencySearchOptions {
  country: MarketCode;
  region?: string;
  limit?: number;
}

export const AGENCY_SEARCH_DEFAULT_LIMIT = 8;

// Shared by the in-memory and D1 stores so both return identical results for
// identical candidate sets (asserted by the D1 contract tests). Candidates
// are country-filtered rows whose name/aliases contain the normalized query;
// ranking: name prefix > name substring > alias-only, with a boost for the
// consumer's own region. One result per canonicalKey — prefer the row for the
// consumer's region, then an active licence, then rank. All licence statuses
// surface (a revoked licensee is the legally interesting case); the UI badges
// rather than hides them.
export function rankAgencySearch(
  candidates: AuthorizedAgency[],
  query: string,
  opts: AgencySearchOptions,
): AuthorizedAgency[] {
  const q = normalizeAgencyName(query);
  if (!q) return [];
  const region = opts.region?.toUpperCase();
  const limit = opts.limit ?? AGENCY_SEARCH_DEFAULT_LIMIT;

  const scored = candidates
    .map((a) => {
      let score = 0;
      if (a.nameNorm.startsWith(q)) score = 3;
      else if (a.nameNorm.includes(q)) score = 2;
      else if (a.aliasesNorm.includes(q)) score = 1;
      if (score === 0) return null;
      if (region && a.region === region) score += 0.5;
      return { a, score };
    })
    .filter((s): s is { a: AuthorizedAgency; score: number } => s !== null);

  const byCanonical = new Map<string, { a: AuthorizedAgency; score: number }>();
  for (const s of scored) {
    const held = byCanonical.get(s.a.canonicalKey);
    if (!held || preferCandidate(s, held, region)) byCanonical.set(s.a.canonicalKey, s);
  }

  return [...byCanonical.values()]
    .sort((x, y) => y.score - x.score || x.a.nameNorm.localeCompare(y.a.nameNorm))
    .slice(0, limit)
    .map((s) => s.a);
}

function preferCandidate(
  next: { a: AuthorizedAgency; score: number },
  held: { a: AuthorizedAgency; score: number },
  region: string | undefined,
): boolean {
  if (region) {
    const nextLocal = next.a.region === region;
    const heldLocal = held.a.region === region;
    if (nextLocal !== heldLocal) return nextLocal;
  }
  const nextActive = next.a.licenceStatus === 'active';
  const heldActive = held.a.licenceStatus === 'active';
  if (nextActive !== heldActive) return nextActive;
  return next.score > held.score;
}
