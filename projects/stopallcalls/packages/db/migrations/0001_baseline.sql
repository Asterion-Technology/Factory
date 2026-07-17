-- StopAllCalls D1 schema draft (SRS §6). Phase 0 deliverable: entity coverage,
-- not final columns. IDs are UUIDv7 strings; timestamps are UTC ISO-8601 TEXT.
-- Soft deletion via deleted_at; audit history is never cascade-deleted.
-- Sensitive columns marked ENCRYPTED hold envelope-encrypted ciphertext
-- (DATA-002); searchable normalized values live in separate *_norm columns
-- (DATA-003).

-- INT-002: consumer email verification. Codes are stored as SHA-256 hashes;
-- plaintext exists only in the outbound email.
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,                    -- normalized (lowercased/trimmed)
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_auth_challenges_email ON auth_challenges(email, created_at);

-- INT-002: resumable consumer sessions. The verified email is the consumer
-- key that intakes are owned by (cross-device resume, INT-008 dedupe).
CREATE TABLE consumer_sessions (
  token TEXT PRIMARY KEY,                 -- 256-bit random hex
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_consumer_sessions_email ON consumer_sessions(email);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  idp_subject TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('INTAKE_STAFF','LAWYER','BILLING','ADMIN','AUDITOR','SERVICE')),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob_encrypted TEXT NOT NULL,            -- ENCRYPTED (DATA-002)
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone_norm TEXT NOT NULL,
  address_json TEXT NOT NULL,
  preferred_contact_method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE client_aliases (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  alias_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Phase 1 reality: intakes are owned by the verified consumer email
-- (consumer_key, INT-002) until the Clio contact model lands in Phase 3;
-- profile and agencies live as validated JSON snapshots of the Zod contracts.
CREATE TABLE intakes (
  id TEXT PRIMARY KEY,
  consumer_key TEXT NOT NULL,             -- normalized verified email
  jurisdiction TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'DRAFT',
  profile_json TEXT,
  agencies_json TEXT NOT NULL DEFAULT '[]',
  submitted_snapshot_json TEXT,           -- immutable on SUBMITTED (INT-007)
  version INTEGER NOT NULL DEFAULT 1,     -- optimistic concurrency (API-002)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_intakes_consumer ON intakes(consumer_key, state);

CREATE TABLE agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  mailing_address TEXT,
  fax TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE debts (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  original_creditor TEXT,
  debt_buyer TEXT,
  account_last4 TEXT,                     -- DATA-001: last four only
  amount_claimed_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'CAD',
  date_first_contacted TEXT,
  date_last_contacted TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE matters (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  debt_id TEXT REFERENCES debts(id),
  clio_matter_id TEXT,
  state TEXT NOT NULL DEFAULT 'MATTER_PENDING',
  duplicate_override_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- DATA-006: one active matter per intake-agency/debt combination.
CREATE UNIQUE INDEX idx_matters_unique_active
  ON matters(intake_id, agency_id, COALESCE(debt_id, ''))
  WHERE duplicate_override_by IS NULL;

CREATE TABLE contact_events (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  channel TEXT NOT NULL,
  first_date TEXT,
  last_date TEXT,
  count_estimate INTEGER,
  allegations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE evidence_files (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  storage_key TEXT NOT NULL UNIQUE,       -- random, non-guessable (EVD-006)
  category TEXT NOT NULL,
  original_filename TEXT NOT NULL,        -- untrusted display text (EVD-006)
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,                            -- set at finalize
  scan_status TEXT NOT NULL DEFAULT 'PENDING_UPLOAD',  -- EVD-005 lifecycle
  custody_json TEXT NOT NULL DEFAULT '[]',              -- chain of custody (EVD-007)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_evidence_intake ON evidence_files(intake_id);

CREATE TABLE evidence_matter_links (
  evidence_id TEXT NOT NULL REFERENCES evidence_files(id),
  matter_id TEXT NOT NULL REFERENCES matters(id),
  PRIMARY KEY (evidence_id, matter_id)
);

CREATE TABLE credit_reports (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  evidence_file_id TEXT NOT NULL REFERENCES evidence_files(id),
  bureau TEXT,
  report_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE identity_verifications (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  provider TEXT NOT NULL,
  provider_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  checks_json TEXT,                       -- redacted match results (IDV-002)
  webhook_event_ids_json TEXT NOT NULL DEFAULT '[]',
  override_by TEXT REFERENCES users(id),
  override_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conflict_checks (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  search_package_json TEXT NOT NULL,
  clio_query_refs_json TEXT,
  disposition TEXT CHECK (disposition IN ('CLEAR','POSSIBLE_CONFLICT','CONFLICT_FOUND')),
  reviewed_by TEXT REFERENCES users(id),  -- human only (CLIO-003)
  rationale TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE retainer_versions (
  id TEXT PRIMARY KEY,
  jurisdiction TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  effective_date TEXT NOT NULL,
  content_hash TEXT NOT NULL,             -- immutable once published (RET-004)
  r2_key TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE retainer_signatures (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  retainer_version_id TEXT NOT NULL REFERENCES retainer_versions(id),
  signer_client_id TEXT NOT NULL REFERENCES clients(id),
  provider_envelope_id TEXT,
  signed_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,            -- RET-003
  created_at TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES intakes(id),
  pricing_snapshot_json TEXT NOT NULL,    -- server-calculated only (PAY-002)
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  matter_id TEXT REFERENCES matters(id),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  provider TEXT NOT NULL,
  provider_ref TEXT,                      -- token/reference only (PAY-008)
  method TEXT NOT NULL CHECK (method IN ('CARD','VISA_DEBIT','EMT')),
  status TEXT NOT NULL DEFAULT 'PENDING',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  emt_confirmed_by TEXT REFERENCES users(id),  -- billing staff only (PAY-005)
  webhook_state_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clio_connections (
  id TEXT PRIMARY KEY,
  tenant_ref TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,          -- ENCRYPTED (CLIO-001)
  refresh_token_encrypted TEXT NOT NULL,  -- ENCRYPTED
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clio_mappings (
  id TEXT PRIMARY KEY,
  local_entity TEXT NOT NULL,
  local_id TEXT NOT NULL,
  clio_resource TEXT NOT NULL,
  clio_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,   -- DATA-005 / CLIO-008
  last_synced_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (local_entity, local_id, clio_resource)
);

CREATE TABLE letter_templates (
  id TEXT PRIMARY KEY,
  jurisdiction TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (jurisdiction, version)
);

CREATE TABLE letter_versions (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id),
  template_id TEXT NOT NULL REFERENCES letter_templates(id),
  source_snapshot_json TEXT NOT NULL,     -- LTR-005
  generator_version TEXT NOT NULL,
  ai_model_prompt_version TEXT,           -- null unless Phase 7 enabled
  content_hash TEXT NOT NULL,             -- approval binds to this (WF-005)
  pdf_r2_key TEXT,
  pdf_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT_PENDING',
  author TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  letter_version_id TEXT NOT NULL REFERENCES letter_versions(id),
  approver_id TEXT NOT NULL REFERENCES users(id),  -- lawyer role (LTR-008)
  letter_content_hash TEXT NOT NULL,      -- exact hash approved (LTR-007)
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  reason TEXT,
  decided_at TEXT NOT NULL
);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL REFERENCES matters(id),
  letter_version_id TEXT NOT NULL REFERENCES letter_versions(id),
  channel TEXT NOT NULL DEFAULT 'EMAIL',
  idempotency_key TEXT NOT NULL UNIQUE,   -- DLV-004
  provider_message_id TEXT,
  recipient TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  matter_id TEXT REFERENCES matters(id),
  intake_id TEXT REFERENCES intakes(id),
  assignee_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,           -- ARC-010
  detail_json TEXT,
  prev_event_hash TEXT,                   -- chained hashes (DATA-004)
  event_hash TEXT NOT NULL,
  occurred_at TEXT NOT NULL
  -- append-only: no UPDATE/DELETE path in the repository layer
);

CREATE TABLE integration_jobs (
  id TEXT PRIMARY KEY,
  queue TEXT NOT NULL,
  job_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,   -- WF-003
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  result_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
