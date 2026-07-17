---
name: stopallcalls-clio-ops
description: >
  Work with the StopAllCalls Clio Manage integration: OAuth connect/reconnect
  ceremony, token handling, the real ClioAdapter, and live verification
  routes. Use for any Clio task in projects/stopallcalls — connecting a
  tenant, debugging OAuth errors (invalid client, redirect URI rejected),
  extending the adapter, or verifying contact/matter provisioning — even if
  the user just says "Clio is broken" or "reconnect Clio".
metadata:
  author: claude-harvested
  verified: "2026-07-17 — live who_am_i round-trip + full write test (contact 2405924708, matter 00001-Testcase, retry-idempotent) against the real US tenant"
---

# StopAllCalls Clio integration ops

Registered app: **id 36464, US instance (`https://app.clio.com`)** — NOT
Canada, despite the firm being Canadian. Credentials in
`d:/REPO/Factory/.devcontainer/.env` as `CLIO_CLIENT_ID`,
`CLIO_CLIENT_SECRET`, `CLIO_BASE_URL`, `CLIO_TOKEN_KEY` (AES key for tokens
at rest); local Next dev needs them mirrored in `apps/web/.env.local`.

## Connect / reconnect ceremony (local)

1. Ensure `apps/web/.env.local` has the CLIO_* vars + `ALLOW_CLIO_CONNECT=1`
   and `CLIO_REDIRECT_URI=http://127.0.0.1:3000/api/oauth/clio/callback`.
2. Dev server MUST run on port 3000 (`pnpm exec next dev -p 3000`) — the
   redirect URI is registered with that exact port.
3. The human opens `http://127.0.0.1:3000/api/oauth/clio/authorize` — via
   **127.0.0.1, not localhost** (different origin; state cookie + registered
   URI both bind to 127.0.0.1).
4. Verify: `curl http://127.0.0.1:3000/api/oauth/clio/status` → must show
   `"apiCheck":"ok (<user name>)"`.

Local connections are in-memory — a dev-server restart loses them (re-run
the ceremony). Deployed uses the D1 `clio_connections` table. Turn
`ALLOW_CLIO_CONNECT` off in deployed vars after connecting.

## Live verification routes (all gated by ALLOW_CLIO_CONNECT)

- `GET /api/oauth/clio/status` — decrypts token, calls `who_am_i`.
- `GET /api/oauth/clio/probe?q=…` — read-only real contact search.
- `POST /api/oauth/clio/write-test?confirm=create&reviewer=<name>` — full
  pipeline (conflict check → disposition → provisioning) with fictitious
  fixture data; CREATES REAL RECORDS — human approval required first.

## What didn't work

- **`http://localhost:3000/...` as a redirect URI** — Clio rejects it:
  "Only HTTPS URIs (and http://127.0.0.1) ... are accepted". Use 127.0.0.1.
- **`ca.app.clio.com` as base URL** — guessed from the firm's jurisdiction;
  the app actually lives on the US instance. Wrong region ⇒ authorize fails.
  Ask/verify the region (the domain seen when logged into Clio) first.
- **Fetching docs.developers.clio.com for payload shapes** — JS-rendered,
  comes back empty. Verify shapes against the live API (unit tests pin the
  v4 shapes in `packages/integrations/test/clio-adapter.test.ts`).

## Gotchas

- **Clio contact search is eventually consistent** — a freshly created
  contact is NOT immediately findable via `query=`. Dedupe therefore relies
  on the idempotency mapping ledger (`clio_mappings`), never on
  search-before-create alone. A probe returning `count:0` right after a
  create is expected, not a bug.
- Access tokens last ~30 days; `getClioAccessToken()` auto-refreshes within
  a 5-minute margin and re-encrypts. Plaintext tokens must never leave the
  call frame (no logging, no responses).
- Adapter errors are status-only by design — Clio error bodies can echo
  request payloads (PII).
- Clio has no native idempotency keys; the interface accepts them for the
  ledger's sake, the real adapter ignores them.
- Document upload is deliberately unimplemented until Phase 5.
