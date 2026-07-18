-- RAD-17: market framework. Markets are config rows, not code — enabling the
-- US later is a status flip through the audited staff API, no deploy.
-- provinces_json is the intake allowlist within a market (Quebec excluded at
-- CA launch per RAD-17 Q3 — Barreau practice-rights + QST + Law 25 pending).
CREATE TABLE markets (
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'dormant')),
  provinces_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO markets (code, status, provinces_json, updated_by, updated_at) VALUES
  ('CA', 'active', '["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","SK","YT"]', 'seed:RAD-17', '2026-07-18T00:00:00.000Z'),
  ('US', 'dormant', '[]', 'seed:RAD-17', '2026-07-18T00:00:00.000Z');

-- Every intake pins its market at creation; market flips never rewrite cases.
ALTER TABLE intakes ADD COLUMN market TEXT NOT NULL DEFAULT 'CA';
