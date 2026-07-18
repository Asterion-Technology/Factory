-- RAD-13 (Phase 4): persist orders, payments, identity verifications, and
-- retainer signatures. Forward-only. Staff/client FKs are relaxed to TEXT
-- identifiers exactly as 0002 did — staff SSO and the clients table are not
-- populated yet; the FKs return when real identities exist.
PRAGMA defer_foreign_keys = true;

-- One order per intake (idempotent server-side pricing, PAY-001/002).
CREATE UNIQUE INDEX idx_orders_intake ON orders(intake_id);

-- payments rebuild: emt_confirmed_by becomes a recorded staff identifier.
CREATE TABLE payments_new (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  provider_ref TEXT,                      -- token/reference only (PAY-008)
  method TEXT NOT NULL CHECK (method IN ('CARD','VISA_DEBIT','EMT')),
  status TEXT NOT NULL DEFAULT 'PENDING',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  emt_confirmed_by TEXT,                  -- billing staff only (PAY-005)
  webhook_state_json TEXT,                -- processed eventIds (PAY-004 replay)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO payments_new (id, order_id, provider, provider_ref, method, status, amount_cents,
    currency, webhook_state_json, created_at, updated_at)
  SELECT id, order_id, provider, provider_ref, method, status, amount_cents,
    currency, webhook_state_json, created_at, updated_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX idx_payments_provider_ref ON payments(provider_ref) WHERE provider_ref IS NOT NULL;

-- identity_verifications rebuild: override_by becomes a staff identifier.
CREATE TABLE identity_verifications_new (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  checks_json TEXT,                       -- redacted match results (IDV-002)
  webhook_event_ids_json TEXT NOT NULL DEFAULT '[]',
  override_by TEXT,                       -- audited manual override (IDV-005)
  override_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO identity_verifications_new (id, intake_id, provider, provider_ref, status, checks_json,
    webhook_event_ids_json, override_reason, created_at, updated_at)
  SELECT id, intake_id, provider, provider_ref, status, checks_json,
    webhook_event_ids_json, override_reason, created_at, updated_at FROM identity_verifications;
DROP TABLE identity_verifications;
ALTER TABLE identity_verifications_new RENAME TO identity_verifications;
CREATE INDEX idx_identity_intake ON identity_verifications(intake_id);
CREATE UNIQUE INDEX idx_identity_provider_ref ON identity_verifications(provider_ref);

-- retainer_signatures rebuild: signer becomes the consumer key (clients table
-- unpopulated); adds the bound content hash (RET-002) and updated_at; a
-- signature may exist before signing completes, so signed_at/evidence relax.
CREATE TABLE retainer_signatures_new (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  retainer_version_id TEXT NOT NULL REFERENCES retainer_versions(id),
  content_hash TEXT NOT NULL,             -- exact hash the envelope binds (RET-002)
  signer_ref TEXT NOT NULL,
  provider_envelope_id TEXT NOT NULL,
  signed_at TEXT,
  evidence_json TEXT,                     -- RET-003
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO retainer_signatures_new (id, intake_id, retainer_version_id, content_hash, signer_ref,
    provider_envelope_id, signed_at, evidence_json, created_at, updated_at)
  SELECT rs.id, rs.intake_id, rs.retainer_version_id, COALESCE(rv.content_hash, ''), rs.signer_client_id,
    COALESCE(rs.provider_envelope_id, ''), rs.signed_at, rs.evidence_json, rs.created_at, rs.created_at
  FROM retainer_signatures rs LEFT JOIN retainer_versions rv ON rv.id = rs.retainer_version_id;
DROP TABLE retainer_signatures;
ALTER TABLE retainer_signatures_new RENAME TO retainer_signatures;
CREATE UNIQUE INDEX idx_retainer_signatures_intake ON retainer_signatures(intake_id);
CREATE UNIQUE INDEX idx_retainer_signatures_envelope ON retainer_signatures(provider_envelope_id);

CREATE INDEX idx_retainer_versions_active ON retainer_versions(jurisdiction, published_at);
