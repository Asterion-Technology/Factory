# TODO

## Out-of-Scope Issues Found

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

- [ ] Observation Deck live data wiring — connect real metrics to dashboard
  - Value: Real-time visibility into agent workload, cost, and PR velocity
  - Suggested implementation: Implement `loadMetrics()` in `dashboards/observation-deck/index.html` to call a local metrics API backed by Langfuse + GitHub API

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
