# Migrations

Forward-only D1 migrations (ARC-008). `0001_init.sql` will be generated from
[`../schema.sql`](../schema.sql) via `wrangler d1 migrations create` when the
local D1 binding is provisioned (Phase 1). Never mutate production schema
manually; reversals are compensating migrations.
