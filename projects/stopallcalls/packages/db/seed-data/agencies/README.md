# Authorized collection agency seed data (RAD-19)

Reference data for the `authorized_agencies` table (migration `0006`). One
normalized CSV per source registry; `seed.sql` is generated from them and both
are checked in so every registry refresh is a reviewable diff.

## Files

| File | What |
|---|---|
| `ca-on.csv` | Ontario — converted from the owner outreach workbook (`docs/Ontario_Collection_Agency_Cease_Desist_Outreach_Researched.xlsx`, not checked in) via `scripts/convert-ontario-xlsx.py` |
| `seed.sql` | Generated upserts — **do not edit**; regenerate instead |

## CSV format

Fixed header (order matters, validated by the generator):

```
country,region,name,aliases,licence_number,licence_status,expires_at,phone,email,website,address_line1,address_line2,city,address_region,postal_code,source_registry,source_url,verified_at
```

- `country`: `CA` | `US`; `region`: 2-letter province/state code.
- `aliases`: pipe-separated trade/operating names (`X-bankers|Canadian Debt Management`).
- `licence_status`: `active|expired|suspended|revoked|unknown` (blank → `unknown`).
- `expires_at`: `YYYY-MM-DD` or blank; `verified_at`: ISO-8601 UTC datetime — when the row was last confirmed against the source registry (required).
- `source_registry` + `source_url`: provenance, required on every row.
- Address: use structured columns when the source provides them; a source that
  publishes only a single mailing line goes wholly into `address_line1`.
- No PII ever — agencies' public business contact data only. Outreach-campaign
  columns from owner workbooks (escalation contacts, C&D tracking, notes) must
  NOT cross into these CSVs.

## Refresh / add a jurisdiction

1. Drop or update the per-registry CSV here (for Ontario: rerun
   `python packages/db/scripts/convert-ontario-xlsx.py <workbook> packages/db/seed-data/agencies/ca-on.csv`).
2. `pnpm --filter @stopallcalls/db agencies:build-seed` — validates every row
   (fails loudly with file:line) and regenerates `seed.sql`.
3. `pnpm --filter @stopallcalls/db test` (the Ontario CSV has an end-to-end test).
4. Apply — **remote is human-gated** (Factory approval gates):
   `CI=true pnpm exec wrangler d1 execute stopallcalls-<env> [--remote] --file ../../packages/db/seed-data/agencies/seed.sql`
   (run from `apps/web/`, add `--config wrangler.staging.jsonc` for staging).

Upserts are idempotent (deterministic ids, `created_at` preserved). Known gap:
a delisted agency is never deleted by a refresh — prune handling is tracked in
`TODO.md`. Confirm a registry's terms of use before checking its data in.
