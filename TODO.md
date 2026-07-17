# TODO

## Out-of-Scope Issues Found

### Factory Infrastructure

#### Security
- [ ] **URGENT (AST-108)** — `next` 15.3.3 in root `package-lock.json` has 10 CVEs incl. CVE-2025-55182 (CRITICAL, pre-auth RCE via React Server Components); Trivy gate red on every PR because of it
  - Location: `package-lock.json` (root)
  - Risk: Pre-auth RCE if any deployed environment serves this build; also blocks the Dependency Scan gate for all PRs
  - Suggested fix: Bump to ≥ 15.3.6 (or 15.5.18 / 16.2.6 to clear all listed CVEs); verify Railway preview/staging aren't serving an affected build
- [ ] Gitleaks gate broken since org transfer (AST-109) — `gitleaks-action@v2` demands a `GITLEAKS_LICENSE` secret for organization-owned repos; fails in ~5s on every run, so no secrets scanning is actually happening
  - Location: `.github/workflows/ci.yml` (Secrets Scan job)
  - Risk: Secrets could merge unscanned; gate change requires human approval
  - Suggested fix: Add `GITLEAKS_LICENSE` secret, or swap the action for a direct `gitleaks` CLI step (CLI is MIT, license-free)
- [ ] Secrets sprawl with name drift across three stores — `.env`, `.devcontainer/.env`, and Windows HKCU user env vars hold overlapping secrets under inconsistent names (`SENTRY_ACCESS_TOKEN` vs `SENTRY_TOKEN`, `FIGMA_API_KEY` vs `FIGMA_ACCESS_TOKEN`, `MONGODB_CONNECTION_STRING` vs `MONGODB_URI`)
  - Location: repo root `.env`, `.devcontainer/.env`, `HKCU\Environment`
  - Risk: Stale/dead credentials silently shadow valid ones (caused the 2026-07-06 MCP outage: placeholder `your-value` registry vars broke Linear/Neon/Railway; a revoked `GITHUB_TOKEN` in the registry shadowed the valid one)
  - Suggested fix: Declare `.devcontainer/.env` the single source of truth; add a `scripts/sync-env-to-registry.sh` (or extend `bootstrap.sh`) that syncs it to HKCU; delete drifted legacy names (`SENTRY_ACCESS_TOKEN`, `FIGMA_API_KEY`, `MONGODB_CONNECTION_STRING`, `LINEAR_WEBHOOK_SECRET=your-value`) from the registry
- [ ] Revoked GitHub PAT still stored in `HKCU\Environment` before 2026-07-06 sync — delete it from GitHub token settings if not already; confirm the replacement PAT has least-privilege scopes
  - Location: was `HKCU\Environment\GITHUB_TOKEN`
  - Risk: Low (token returns 401) but dead credentials should be cleaned up at the issuer
  - Suggested fix: Audit https://github.com/settings/tokens and revoke unused PATs
- [ ] `RAILWAY_TOKEN` is revoked/expired at the source (2026-07-06) — `.devcontainer/.env` and the synced Windows env hold the same dead token; Railway API rejects it as both an account token and a project token. Breaks `railway` CLI, `factory-railway` MCP, and the npx `railway` MCP server
  - Location: `.devcontainer/.env` → `HKCU\Environment\RAILWAY_TOKEN`
  - Risk: No deployment status/log visibility from the factory; bootstrap `--check` reports it "ok" because it only tests presence, not validity
  - Suggested fix: Mint a new token in the Railway dashboard, update `.devcontainer/.env`, re-sync to HKCU; consider adding a lightweight validity probe (`railway whoami`) to `bootstrap.sh --check`

#### Technical Debt
- [ ] `scripts/serve-dashboard.sh` prefers `npx serve`, which leaks a file handle per request on Windows — the Observation Deck polls `events.jsonl` every 3s, so the server crashes with `EMFILE: too many open files` after ~90 minutes (observed 2026-07-08)
  - Location: `scripts/serve-dashboard.sh` (npx branch)
  - Suggested fix: prefer the Python `http.server` branch on Windows (no leak), or pin a static-server package without the leak; Python fallback verified working on port 3099
- [ ] `.mcp.json` is untracked — decide whether to commit it (current version contains only `${VAR}` references, no literal secrets, so it is safe to track)
  - Location: `.mcp.json`
  - Suggested fix: `git add .mcp.json` on a feature branch once the 2026-07-06 rewrite is confirmed working
- [ ] `factory-knowledge` requires local ChromaDB (`docker compose -f knowledge/docker-compose.yml up -d`) — not started automatically
  - Location: `knowledge/docker-compose.yml`, `mcp/servers/knowledge/index.js`
  - Suggested fix: Add a health check + start hint to `scripts/bootstrap.sh`
- [ ] MCP servers pass literal `${VAR}` strings downstream when an env var is unset (e.g. `Failed to parse URL from ${MEILI_HOST}/health`) — servers should fail fast at startup with a clear message
  - Location: `mcp/servers/*/index.js`
  - Suggested fix: Validate required env vars on boot and exit with a named-variable error
- [ ] `railway` MCP server defined in two conflicting scopes — user scope points to `https://mcp.railway.com`, project scope to `npx @railway/mcp-server`; OAuth/token state doesn't carry across, and the npx one fails to connect
  - Location: user-level MCP config + `.mcp.json`
  - Suggested fix: `claude mcp remove railway -s user` (or `-s project`) — keep one
- [ ] `map_job_status()` in `scripts/metrics-collector.sh` still greps pretty-printed JSON with `"name":"..."` (no space after colon) — the exact zero-width-match pattern that made every PR metric read 0 before; security-gate statuses likely always fall through to the default
  - Location: `scripts/metrics-collector.sh` (security gate section)
  - Suggested fix: Parse the jobs response with node like the PR metrics now do
- [ ] Haven metrics in the Metrics Collection workflow depend on a `CROSS_REPO_TOKEN` repo secret (auto `GITHUB_TOKEN` can't read Gyro06/Haven) — Haven counts silently read 0 if the secret is missing/expired
  - Location: `.github/workflows/metrics.yml`
  - Suggested fix: Confirm `CROSS_REPO_TOKEN` exists in Asterion-Technology/Factory repo secrets after PR #6 merges; if Haven's by_repo entry stays all-zero on a real week, that's the tell

### StopAllCalls (projects/stopallcalls — AST-167 / AST-168)

#### Deferred from Phase 0 scaffold PR
- [ ] Cloudflare resource provisioning (D1, R2 buckets, Queues, Access, Turnstile) — `infra/wrangler.*.jsonc` hold placeholder IDs
  - Location: `projects/stopallcalls/infra/`
  - Suggested fix: Provision per environment (dev/preview/staging/prod, OPS-001) after human approval of the Cloudflare account/secrets; fill IDs and add `wrangler`/`@opennextjs/cloudflare` devDependencies at that point
- [ ] Factory CI does not run StopAllCalls checks (pnpm typecheck/lint/test) — `.github/workflows/` changes are human-gated
  - Location: `.github/workflows/ci.yml`
  - Suggested fix: Add a path-filtered job for `projects/stopallcalls/**` with human approval of the workflow change
- [ ] Threat model document not yet authored (Phase 0 exit item, SRS §14)
  - Location: `projects/stopallcalls/docs/`
  - Suggested fix: Author with security review before Phase 2 (evidence uploads) begins
- [ ] `packages/ui` intentionally not scaffolded (SRS §15: no unused complexity) — create when Phase 1 needs shared components
 
#### Phase 1 remaining (RAD-3, formerly AST-169)
- [x] Consumer email one-time-code verification + resumable session (INT-002) — done 2026-07-16 (`packages/db/src/auth.ts`, `/api/auth/*` routes); phone-number verification variant not built (email only)
- [x] Server-side abuse controls: Turnstile adapter + rate limiting + duplicate-submission prevention (INT-008) — done 2026-07-16 with `FakeTurnstileAdapter`
- [x] Playwright E2E intake tests, mobile + desktop viewports (Phase 1 exit criterion) — 10 passing (`e2e/intake.spec.ts`)
- [ ] Real Turnstile: render the client widget (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and add the siteverify adapter (`TURNSTILE_SECRET_KEY` wrangler secret) — blocked on Cloudflare provisioning; placeholder token marked in `apps/web/src/app/intake/IntakeWizard.tsx`
- [ ] Real email provider adapter for verification codes — `FakeEmailAdapter` is dev-only; wire Resend (or chosen provider) behind `EmailAdapter` at provisioning
- [ ] Durable rate limiting — `SlidingWindowRateLimiter` is per-instance in-memory; move to Durable Object or D1 counters at provisioning
- [ ] D1-backed IntakeStore + AuthStore — in-memory stores (`packages/db/src/memory.ts`, `src/auth.ts`) are dev-only and lose state on restart; swap behind the interfaces once D1 is provisioned
- [ ] Agency entry edit/duplicate actions (INT-004) — add/remove implemented; edit and duplicate not yet
- [ ] Versioned amendments after submission (INT-007) — snapshot immutability enforced; amendment flow not yet built

#### Linear workspace migration (in flight)
- [ ] Finish migrating StopAllCalls issues to the `radical-disruption` Linear WORKSPACE (existing project: linear.app/radical-disruption/project/cease-7310f76584a9) — current MCP auth + `LINEAR_API_KEY` only reach asterion1971; needs a personal API key from the new workspace, then recreate RAD-1..9 there (cross-workspace moves unsupported by Linear API)
- [ ] After the workspace migration: update Linear links in `projects/stopallcalls/docs/BUILD_PLAN.md`, `config/repos.yaml` `linear_project`, and archive the interim `radical-disruption` team inside asterion1971

#### Product owner / counsel clarification needed (SRS §16 open decisions)
- [ ] All SRS §16 defaults require confirmation before production: operating jurisdiction, evidence rule, payment timing (letter before/after payment differs between AST-167 narrative and SRS default), identity/credit-report retention, client BCC policy, Phase 2 solicitation email rules, Clio tenant conflict-check capabilities, database region/residency, AI provider posture
  - Location: `projects/stopallcalls/docs/BUILD_PLAN.md` (open decisions table)
  - Suggested fix: Review with qualified counsel; record each decision as configuration, not code

#### Factory Infrastructure (found during this build)
- [ ] `config/repos.yaml` declares `base: "d:/REPO"` but Haven's `local_path` is an absolute `C:/Users/RDM71/REPO/Haven` — cross-drive inconsistency if tooling resolves paths against `base`
  - Location: `config/repos.yaml`
  - Suggested fix: Support absolute-path overrides explicitly in `scripts/resolve-repo.sh` docs, or normalize the manifest

### Notary Control Hub

#### Security
- [ ] Presigned URL redirect in `/api/documents/[id]` GET exposes the R2 URL in the Location header — browser sees the signed URL
  - Location: `projects/notary-control-hub/src/app/api/documents/[id]/route.ts`
  - Risk: Low (URLs are short-lived 15 min TTL) but could be captured in logs
  - Suggested fix: Consider streaming the file through the server rather than redirecting for higher-sensitivity docs

- [ ] Windows OS-level env vars silently override `.env` and `.env.local` — any env var set at the user or system level in Windows will always win over `.env` files
  - Location: `projects/notary-control-hub/src/lib/prisma.ts`, `next.config.ts` (workaround applied for DATABASE_URL)
  - Risk: Wrong credentials used in dev without any error — silent misconfiguration
  - Suggested fix: Document this Windows-specific gotcha in `bootstrap/first-run.md`; extend the fs.readFileSync workaround to all critical env vars (R2, Clerk, etc.) or remove stale OS-level vars via Control Panel

#### Missing Features / Incomplete Flows
- [ ] Invoice detail page `/invoices/[id]` not yet built
  - Path: `projects/notary-control-hub/src/app/(app)/invoices/[id]/page.tsx`
- [ ] Invoice create page `/invoices/new` not yet built
  - Path: `projects/notary-control-hub/src/app/(app)/invoices/new/`
- [ ] PDF export for invoices not yet implemented
- [ ] Webhook for Clerk user creation not yet built — `getOrCreateDbUser` creates user lazily on first request
  - Location: `projects/notary-control-hub/src/lib/auth.ts`
  - Suggested fix: Add `/api/webhooks/clerk` route to handle `user.created` event
- [ ] Communication log on assignment detail — currently only accessible from contact detail; an assignment's own comm log view is missing
  - Path: `projects/notary-control-hub/src/app/(app)/assignments/[id]/page.tsx`

#### Technical Debt
- [ ] `generateInvoiceNumber()` in `src/app/api/invoices/route.ts` uses random numbers — not guaranteed unique
  - Location: `projects/notary-control-hub/src/app/api/invoices/route.ts`
  - Suggested fix: Use a DB sequence or year+sequential counter per user
- [ ] R2 bucket name in `.env` is `"scrap"` — rename to a purpose-specific bucket (e.g., `notary-documents`) before production
  - Location: `projects/notary-control-hub/.env` — `R2_BUCKET_NAME`
  - Suggested fix: Create a dedicated R2 bucket; update `.env` and Railway secrets

#### Future Enhancements
- [ ] Email invoice via Resend
- [ ] RON integration — platform-specific workflow support
- [ ] Audit log viewer page for user to review their own activity
- [ ] Settings page — profile editing (notary state, stamp/E&O expiry dates)
- [ ] Export assignment history as CSV
- [ ] Checklist template management UI — currently templates can only be applied via API

### Future Enhancements

- [x] Linear workflow integration — ✅ COMPLETE (Phase 7)
  - `scripts/start-issue.sh` fetches issue from Linear API, creates typed branch, updates status to In Progress
  - `.github/workflows/linear-sync.yml` auto-syncs issue → In Review on PR open, → Done on PR merge
  - `scripts/changelog.sh` generates Keep a Changelog entries via Ollama on every merge
  - `.github/workflows/changelog.yml` runs changelog generation automatically on merge to main
  - `.github/workflows/metrics.yml` collects factory metrics on a 6-hour schedule
  - `docs/workflow/guide.md`, `example-issue.md`, `first-project.md` document the full pipeline

- [x] Custom MCP wrappers (Phase 3) — ✅ COMPLETE — all 10 servers implemented in `mcp/servers/`
  - clerk, idme, meilisearch, snyk, semgrep, sonarqube, resend, cloudflare-r2, railway, magic21
  - Run `bash mcp/servers/install-all.sh` to install dependencies, then `bash scripts/install-mcps.sh` to sync to Claude Code

- [ ] Magic21 API endpoint verification — confirm `MAGIC21_API_BASE` URL matches production Magic21 API
  - Location: `mcp/servers/magic21/index.js` — defaults to `https://api.magic21.ai/v1`
  - Risk: Magic21 API base URL unknown at build time — set `MAGIC21_API_BASE` env var if it differs
  - Suggested fix: Confirm with Magic21 and update default in `index.js` line 8

- [ ] id.me API endpoint verification — confirm id.me public API base URL for production use
  - Location: `mcp/servers/idme/index.js` — uses `https://api.id.me/api/public/v3`
  - Risk: id.me API versioning and auth scope may differ by environment
  - Suggested fix: Validate against id.me developer documentation

- [x] Observation Deck live data wiring — AST-48, partially complete
  - Real-time tool/MCP event feed via `events.jsonl` (3s polling) ✅
  - Session stats, MCP call counts, RTK live events ✅
  - `scripts/log-tool-event.js` PostToolUse hook + `scripts/serve-dashboard.sh` ✅
  - **Remaining: wire PostToolUse hook** — add to `.claude/settings.json`:
    ```json
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "node d:/REPO/Factory/scripts/log-tool-event.js" }] }]
    ```
  - **Remaining: Langfuse cost wiring** — set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` env vars (see below)

- [ ] Langfuse telemetry wiring — connect LiteLLM → Langfuse for cost and token tracking
  - Value: Populates Observation Deck cost metrics; enables RTK savings reporting and per-model cost attribution
  - Suggested implementation: Set `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` env vars + enable callback in `config/litellm.yaml`

- [x] Knowledge platform — ✅ COMPLETE (Phase 6)
  - ChromaDB vector store via `knowledge/docker-compose.yml` (port 8000, token-authed)
  - nomic-embed-text embeddings via Ollama (pulled on first ingest if missing)
  - `knowledge/ingest.js` — walks docs/, policies/, agents/, prompts/; chunks by heading; stores embeddings in ChromaDB
  - `mcp/servers/knowledge/index.js` — `factory-knowledge` MCP server (search_knowledge, ingest_document, list_collections, get_collection_stats)
  - Setup: `docker compose -f knowledge/docker-compose.yml up -d` then `node knowledge/ingest.js`

- [ ] Ollama model management automation — automate model pulls in bootstrap
  - Value: Eliminates manual `ollama pull` step on new workstations (`mistral:7b`, `codellama:7b`, `nomic-embed-text` all required now)
  - Suggested implementation: Add model availability check + pull loop to `scripts/bootstrap.sh`

- [ ] End-to-end Phase 7 workflow — run first real project through full factory pipeline
  - Value: Validates all phases work together end-to-end; surfaces integration gaps
  - Suggested implementation: Create a test Linear issue → Claude creates branch + implements → Codex reviews → Ollama writes changelog → Railway preview → human approval → metrics appear in Observation Deck

### Technical Debt

- [ ] `scripts/bootstrap.sh` Ollama model pull requires Ollama to be running — fails silently if not
  - Location: `scripts/bootstrap.sh`
  - Suggested fix: Add explicit Ollama health check and pull loop for `mistral:7b`, `codellama:7b`, `nomic-embed-text`

- [ ] ChromaDB `CHROMA_TOKEN` default is `factory-chroma-token` — must be rotated before production use
  - Location: `knowledge/docker-compose.yml`, `.devcontainer/devcontainer.json`, `mcp/servers/knowledge/index.js`
  - Risk: Default token is in source; anyone with repo access knows it
  - Suggested fix: Set `CHROMA_TOKEN` as an environment variable / Railway secret; never commit the actual token

- [ ] `config/litellm.yaml` uses placeholder model names — verify against current OpenAI and Ollama model IDs before production use
  - Location: `config/litellm.yaml`
  - Suggested fix: Pin exact versioned model IDs (e.g., `gpt-4o-2024-08-06`) to avoid silent routing changes on model deprecation

### Security

- [ ] `self-learning` skill provenance — upstream `github.com/Kulaxyz/self-learning-skills` is a new repo (created 2026-06-28) from a single unverified author, with high star velocity for its age
  - Location: `.claude/skills/self-learning/`
  - Risk: Low today (content is inert Markdown, no code execution, vendored/pinned rather than live-fetched) but the account or repo could turn adversarial later
  - Suggested fix: Before ever re-syncing past the pinned commit (`d4e0a7ec1f1ae1b5c7f7972b52ad8ed0c2c067ae`), re-run the safety review; do not switch to the live `/plugin marketplace` or `npx skills` install paths for this skill

- [ ] MCP server authentication — verify all custom MCP connections enforce token-based auth
  - Location: `mcp/mcp.factory.json`, `mcp/servers/` (Phase 3)
  - Risk: Unauthenticated MCP servers in devcontainer could be exploited if the container is network-exposed
  - Suggested fix: Enforce `Authorization: Bearer` headers on all custom MCP wrapper servers; document in `policies/human-approval-gates.md`

- [ ] Secret rotation policy — define rotation schedule for all long-lived tokens
  - Location: `bootstrap/first-run.md`
  - Risk: Long-lived `LINEAR_API_KEY`, `GITHUB_TOKEN`, `RAILWAY_TOKEN`, `OPENAI_API_KEY` with no rotation schedule
  - Suggested fix: Document 90-day rotation in runbook; evaluate GitHub fine-grained PATs with expiry; consider HashiCorp Vault or Railway secrets management for production

- [ ] Gitleaks baseline — add `.gitleaks.toml` allowlist before first commit to avoid false positives on test fixtures or example values
  - Location: Repository root
  - Risk: CI Gitleaks gate may block legitimate commits containing example API key formats in docs
  - Suggested fix: Create `.gitleaks.toml` with allowlist entries for known safe patterns in `docs/` and `config/`

- [ ] Semgrep rule scope — current CI gate runs default ruleset; project-specific rules not yet defined
  - Location: `.github/workflows/ci.yml`
  - Risk: Default Semgrep rules may miss project-specific vulnerabilities (e.g., LLM prompt injection, MCP server auth bypass)
  - Suggested fix: Add custom Semgrep rules for LLM/MCP patterns to `policies/` and reference in CI

### Broken Links / Missing Routes

- [ ] Observation Deck loads `metrics.json` from relative path — will 404 until metrics pipeline is built
  - Path: `dashboards/observation-deck/index.html` → `./metrics.json`
  - Expected behavior: Dashboard should show empty/zero state gracefully, not an uncaught fetch error
  - Suggested fix: Add `try/catch` around fetch with fallback to zero-state render (already implemented in current scaffold)

### Usability

- [ ] `bootstrap/first-run.md` should include a verified walkthrough for Windows (PowerShell) users, not just bash
  - Impact: Windows developers may hit path or shell syntax issues during first-run setup
  - Suggested fix: Add a PowerShell equivalent section to `bootstrap/first-run.md` alongside the bash instructions

- [ ] No `.env.example` at the repository root — developers must discover required env vars from multiple config files
  - Impact: Onboarding friction; risk of missing a required variable
  - Suggested fix: Create a root `.env.example` consolidating all env var names from `mcp.factory.json`, `config/litellm.yaml`, and `langfuse.env.example`
