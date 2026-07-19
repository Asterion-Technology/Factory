-- RAD-19: authorized collection agency registry (reference data, no PII).
-- One row per (agency, jurisdiction licence) — Canadian licensing is
-- provincial, US is state-level; canonical_key groups the same firm across
-- jurisdictions for lookup dedupe. DDL only: rows are loaded and refreshed
-- via generated idempotent upsert SQL (packages/db/seed-data/agencies),
-- never inline here — registry data changes far more often than schema and
-- migrations are forward-only (ARC-008). Deterministic ids
-- (aa:{country}:{region}:{slug}) keep intake authorizedAgencyId references
-- stable across refreshes.
CREATE TABLE authorized_agencies (
  id TEXT PRIMARY KEY,
  canonical_key TEXT NOT NULL,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  aliases_norm TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL CHECK (country IN ('CA', 'US')),
  region TEXT NOT NULL,
  licence_number TEXT,
  licence_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (licence_status IN ('active', 'expired', 'suspended', 'revoked', 'unknown')),
  expires_at TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  address_region TEXT,
  postal_code TEXT,
  source_registry TEXT NOT NULL,
  source_url TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_authorized_agencies_lookup ON authorized_agencies (country, region, name_norm);
CREATE INDEX idx_authorized_agencies_name ON authorized_agencies (name_norm);
CREATE INDEX idx_authorized_agencies_canonical ON authorized_agencies (canonical_key);
-- Some registries publish search-only UIs without licence numbers, hence partial.
CREATE UNIQUE INDEX idx_authorized_agencies_licence
  ON authorized_agencies (country, region, licence_number)
  WHERE licence_number IS NOT NULL;
