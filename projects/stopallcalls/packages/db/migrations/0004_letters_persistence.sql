-- RAD-14/RAD-15 (Phases 5-6): persist the letter pipeline (templates,
-- versions, approvals, deliveries, tasks). Forward-only. Staff FKs relax to
-- TEXT identifiers exactly as 0002/0003 did until staff SSO exists.
PRAGMA defer_foreign_keys = true;

-- Template bodies are small legal text; storing inline keeps rendering
-- deterministic without an R2 round-trip (r2_key remains for provenance).
ALTER TABLE letter_templates ADD COLUMN body TEXT NOT NULL DEFAULT '';

-- LTR-005 metadata: the template version used is recorded on every letter.
ALTER TABLE letter_versions ADD COLUMN template_version INTEGER NOT NULL DEFAULT 0;

-- approvals rebuild: approver becomes a recorded staff identifier (LTR-008).
CREATE TABLE approvals_new (
  id TEXT PRIMARY KEY,
  letter_version_id TEXT NOT NULL REFERENCES letter_versions(id),
  approver_id TEXT NOT NULL,              -- lawyer role (LTR-008)
  letter_content_hash TEXT NOT NULL,      -- exact hash approved (LTR-007)
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  reason TEXT,
  decided_at TEXT NOT NULL
);
INSERT INTO approvals_new (id, letter_version_id, approver_id, letter_content_hash, decision, reason, decided_at)
  SELECT id, letter_version_id, approver_id, letter_content_hash, decision, reason, decided_at FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;

CREATE INDEX idx_letter_versions_matter ON letter_versions(matter_id);
CREATE INDEX idx_approvals_letter_version ON approvals(letter_version_id);
CREATE UNIQUE INDEX idx_deliveries_provider_msg
  ON deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_tasks_matter ON tasks(matter_id);
