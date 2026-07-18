-- RAD-5 (Phase 3): persist Clio provisioning state (conflict checks, matters,
-- idempotency ledger). Forward-only.
PRAGMA defer_foreign_keys = true;

-- The ledger records the Clio display number so a retry can rebuild matter
-- records without a Clio round-trip.
ALTER TABLE clio_mappings ADD COLUMN display_number TEXT;

-- matters rebuild: adds display_number, and agency_id now stores the immutable
-- snapshot agency id — agencies live inside the intake's submitted snapshot
-- JSON (INT-007), not the relational agencies table, so that FK is removed.
CREATE TABLE matters_new (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  agency_id TEXT NOT NULL,                -- StoredAgency id within the snapshot
  debt_id TEXT REFERENCES debts(id),
  clio_matter_id TEXT,
  display_number TEXT,
  state TEXT NOT NULL DEFAULT 'MATTER_PENDING',
  duplicate_override_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO matters_new (id, intake_id, agency_id, debt_id, clio_matter_id, state,
    duplicate_override_by, created_at, updated_at)
  SELECT id, intake_id, agency_id, debt_id, clio_matter_id, state,
    duplicate_override_by, created_at, updated_at FROM matters;
DROP TABLE matters;
ALTER TABLE matters_new RENAME TO matters;

-- DATA-006: one active matter per intake-agency/debt combination.
CREATE UNIQUE INDEX idx_matters_unique_active
  ON matters(intake_id, agency_id, COALESCE(debt_id, ''))
  WHERE duplicate_override_by IS NULL;

-- conflict_checks rebuild: reviewed_by becomes a plain human identifier —
-- staff SSO (Cloudflare Access) is not built yet, so there are no users rows
-- to reference. The FK returns when staff identity lands (see TODO.md).
CREATE TABLE conflict_checks_new (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  search_package_json TEXT NOT NULL,
  clio_query_refs_json TEXT,
  disposition TEXT CHECK (disposition IN ('CLEAR','POSSIBLE_CONFLICT','CONFLICT_FOUND')),
  reviewed_by TEXT,                       -- human only (CLIO-003)
  rationale TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO conflict_checks_new (id, intake_id, search_package_json, clio_query_refs_json,
    disposition, reviewed_by, rationale, reviewed_at, created_at)
  SELECT id, intake_id, search_package_json, clio_query_refs_json,
    disposition, reviewed_by, rationale, reviewed_at, created_at FROM conflict_checks;
DROP TABLE conflict_checks;
ALTER TABLE conflict_checks_new RENAME TO conflict_checks;

CREATE INDEX idx_conflict_checks_intake ON conflict_checks(intake_id);
