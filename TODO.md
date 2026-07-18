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
- [x] Cloudflare dev provisioning (2026-07-16, account `0440a74c…` radical-disruptive): D1 `stopallcalls-dev` created + schema applied (29 tables), queues `stopallcalls-jobs-dev`/`-dlq-dev` created, Turnstile widget `stopallcalls-dev` created (sitekey/secret in `.devcontainer/.env`), real D1 id in `infra/wrangler.*.jsonc`, `wrangler` devDependency added
- [x] R2 enabled + private buckets `stopallcalls-evidence-dev` / `stopallcalls-documents-dev` created (location hint enam, 2026-07-16) — matches `infra/wrangler.*.jsonc` bindings
- [x] Real Turnstile wired (2026-07-16): `CloudflareTurnstileAdapter` + client widget, env-switched (`apps/web/.env.local` locally; E2E pins the fake); `wrangler secret put TURNSTILE_SECRET_KEY` at deploy remains human-gated
- [ ] Provision preview/staging/prod environments (OPS-001) — only dev exists; `@opennextjs/cloudflare` devDependency + first deploy still pending (deploy is human-gated)
- [ ] Cloudflare Access (staff SSO/MFA) not yet configured — needed by Phase 2 evidence review; token lacks the Access scope (add when needed)
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

#### Linear workspace migration
- [x] StopAllCalls issues recreated in the radical-disruption workspace's **Cease** project as RAD-8..RAD-16 (2026-07-16; key stored as `RADICAL_LINEAR_API_KEY` in `.devcontainer/.env`); BUILD_PLAN links and `config/repos.yaml` updated
- [ ] Archive or delete the interim `radical-disruption` team (RAD-1..9) inside asterion1971 — duplicates of the new-workspace issues; deleting a team archives its issues, so needs a human call
- [ ] Factory Linear MCP still auths to asterion1971 — day-to-day StopAllCalls issue updates need the curl/`RADICAL_LINEAR_API_KEY` path (or re-point the MCP) until switched

#### Phase 2 — Evidence (RAD-11, started 2026-07-16)
- [x] Upload pipeline: validated request → signed-URL PUT → magic-byte/MIME + size verification → sha256 → quarantine → scan → CLEAN/INFECTED, chain-of-custody events, soft removal; wizard "Proof upload" step; 12 unit + 4 E2E tests
- [x] Real R2 storage adapter (2026-07-16): `R2StorageAdapter` — SigV4 query-presigned PUT (verified live against `stopallcalls-evidence-dev`, opt-in test `r2.live.test.ts`) + binding-backed get/delete; swapped in at deploy wiring
- [x] D1-backed stores (2026-07-16): `D1IntakeStore`/`D1AuthStore`/`D1EvidenceStore` + `migrations/0001_baseline.sql`, tested against real D1 via vitest-pool-workers (`pnpm --filter @stopallcalls/db test:d1`; pinned 0.12.x — 0.13+ needs vitest 4)
- [x] Remote D1 re-baselined (2026-07-16, human-approved): all 29 empty draft tables dropped, `0001_baseline.sql` applied via `wrangler d1 migrations apply` (tracking now active; future changes = new numbered migration files in `packages/db/migrations/`)
- [x] D1/R2 wired into `apps/web` (2026-07-16): `SAC_BACKEND=cloudflare` (wrangler var) switches `lib/store.ts` to D1 stores + R2 presigning via `getCloudflareContext()`; fakes remain the default for dev/tests. `@opennextjs/cloudflare` + `apps/web/wrangler.jsonc` (real dev config) + `open-next.config.ts` added
- [ ] BLOCKED ON USER: `pnpm --filter @stopallcalls/web build:cf` fails with EPERM — Next standalone tracing needs symlinks; enable Windows **Developer Mode** (Settings → System → For developers), then build + `wrangler deploy --dry-run` can be verified
- [x] Secrets pushed to `stopallcalls-web-dev` draft worker (2026-07-16, human-approved): `TURNSTILE_SECRET_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (derived per R2 S3-auth docs from the API token); `SAC_E2E_EXPOSE_CODES=1` set as a DEV-ONLY var in `apps/web/wrangler.jsonc` until Resend is wired
- [ ] Mint a dedicated R2-scoped API token for runtime presigning (current dev signing pair derives from the broad provisioning token — works, but not least-privilege)
- [x] Symlink blocker solved in-repo (2026-07-16): `nodeLinker: hoisted` in `pnpm-workspace.yaml` — flat node_modules, no symlinks, so Next standalone tracing works with Developer Mode off on any machine. `build:cf` ✅ and `wrangler deploy --dry-run` ✅ (all bindings resolve; 901 KB gzip); full suite re-verified under the hoisted layout. NOTE: after changing nodeLinker, delete ALL node_modules (root + every package) before `pnpm install` — stale per-package bin shims break vitest otherwise
- [x] DEPLOYED (2026-07-16, human-approved): https://stopallcalls-web-dev.rick-044.workers.dev — version 356f0485; workers.dev hostname added to the Turnstile widget domains. Smoke-verified: landing 200; server-side Turnstile enforcement live (fake token → 403 from real siteverify); D1 read path live (bogus session cookie → clean `{email:null}`); real widget renders and correctly challenges headless automation (full-journey automation blocked BY the bot protection — by design)
- [x] LIVE END-TO-END VERIFIED by human click-through (2026-07-17): full journey on the deployed dev site — Turnstile challenge, on-screen dev code, D1 session/profile/agencies, R2 presigned upload (after CORS fix), scan CLEAN with sha256, SUBMITTED with immutable snapshot (intake 85112088…)
- [ ] When staging/prod origins exist: add them to the R2 bucket CORS rule (and the Turnstile widget domains) — both are per-hostname allowlists
- [ ] Scan via `stopallcalls-jobs-dev` queue consumer instead of inline (interface `FinalizeDeps` unchanged); real malware scanning service selection pending
- [ ] Staff evidence-review workspace + sufficiency rule (EVD-009/EVD-010) and credit-report handling (EVD-008) — needs Cloudflare Access (staff SSO) first
- [ ] Attestation-only path (no uploads) flagged for lawyer review — SRS gate alternative, needs product-owner wording

#### Phase 3 — Conflict + Clio (RAD-12, started 2026-07-17)
- [x] Clio OAuth connect flow (encrypted tokens, state CSRF, interim admin gate), status probe, real v4 ClioAdapter with auto-refresh token provider; full-pipeline write test passed against the real Clio tenant (2026-07-17)
- [x] Phase 3 core: conflict-search package → human-only disposition → gate-checked idempotent provisioning, with in-memory retry tests proving no duplicate contacts/matters (2026-07-17)
- [x] D1 persistence (2026-07-18): `D1ConflictCheckStore`/`D1MatterStore`/`D1ClioMappingStore` + `migrations/0002_clio_persistence.sql` (adds display_number columns; drops matters→agencies FK since agencies live in the snapshot JSON; conflict reviewed_by is TEXT until staff SSO); exit-criterion retry tests re-proven against real D1 (`test-workers/d1-stores.test.ts`)
- [x] Submit-flow wiring (2026-07-18): conflict check auto-runs on intake submission (best-effort, idempotent, consumer never sees it — WF-006); staff API `GET/POST /api/staff/intakes/:id/conflict`, `POST …/conflict/disposition`, `POST …/provision` (provision evaluates the REAL gate snapshot, so it stays blocked until Phase 4 gates exist)
- [ ] HUMAN-GATED: apply `0002_clio_persistence.sql` to remote dev D1 (`wrangler d1 migrations apply stopallcalls-dev --remote` from `apps/web/`) before the next deploy
- [ ] Config-driven Clio custom-field mappings validated at startup (CLIO-007)
- [ ] Retry queue + staff resolution for permanent Clio failures (CLIO-008/CLIO-009) — needs the `stopallcalls-jobs-dev` consumer (still a Phase 0 stub); move the post-submit conflict check there too
- [ ] Staff conflict routes use the interim `ALLOW_CLIO_CONNECT` admin gate — replace with Cloudflare Access staff identity, and restore the `conflict_checks.reviewed_by` → `users(id)` FK once real staff identities exist

#### Phase 4 — Identity / Retainer / Payment (RAD-13, started 2026-07-18)
- [x] Domain: payment state machine (card + EMT flows, PAY-006 gate helper), deterministic pricing engine (PAY-001/002), evaluateGates
- [x] Services: idempotent orders from frozen snapshots; hosted-checkout payments with signature-verified replay-protected webhooks (PAY-003/004); billing-staff-only EMT confirmation (PAY-005); provider-hosted IDV with mismatch→manual-review + audited overrides (IDV-001..005); immutable retainer versions with hash-bound e-signature evidence (RET-001..005)
- [x] Routes: consumer checkout/identity/retainer, webhook endpoints (payment + identity), staff EMT-confirm / identity-override / retainer-publish; provisioning now evaluates the full real gate snapshot (lib/gates.ts)
- [x] D1 stores + migration 0003 (2026-07-18, commit 1cc4294): orders/payments/identity_verifications/retainer_* persisted, FKs relaxed like 0002, UNIQUE orders(intake_id), provider-ref unique indexes; 5 real-D1 contract tests
- [ ] HUMAN-GATED: apply migrations 0002 + 0003 to remote dev D1 (`wrangler d1 migrations apply stopallcalls-dev --remote` from `apps/web/`) before the next deploy
- [ ] Real provider selection (payments, IDV, e-signature) — SRS §16 human decision; fakes only today (DEV-003). New provider = sandbox adapter in packages/integrations behind env switch + Snyk scan
- [ ] Pricing amounts + EMT instructions text are PLACEHOLDERS (SAC_PRICING / SAC_EMT_INSTRUCTIONS env) — product owner/counsel must set real values before production
- [ ] Consumer post-submit UI (identity/retainer/payment steps + status) — wizard currently ends at submission; API flows exist but have no screens (full portals are Phase 6 UI-001..006)
- [ ] Audit-events table exists but no audit store yet — EMT confirmations and identity overrides record actor on the row; wire append-only audit_events in Phase 6 (DATA-004)

#### Phase 5 — Letters (RAD-14, started 2026-07-18)
- [x] Deterministic letter engine (domain): strict placeholder templates from verified structured fields only, versioned generator (LTR-001/002); letter versions record template version, input snapshot, generator version, PDF hash (LTR-005)
- [x] Hash-bound lawyer-only approval (LTR-006..008 / WF-005): approve/reject binds to the exact content hash reviewed; regeneration supersedes and reverts APPROVED matters to IN_REVIEW; stale approvals can never authorize a send
- [x] Delivery (DLV-001..007): exactly-once send (idempotency-keyed, re-verifies approval + ALL gates at send time), sent copy uploaded to the Clio matter, bounce → matter BOUNCED + follow-up task; RealClioAdapter.uploadDocument implemented (v4 three-step flow)
- [x] Staff routes: template publish, letter generate/review payload (content + prior-version diff source + gates), submit-for-review, decision, send; email delivery webhook (shared-secret, fails closed)
- [x] D1 stores + migration 0004 (2026-07-18): letter templates (inline body), versions (+template_version), approvals (staff TEXT ids), deliveries, tasks all persisted; full-pipeline D1 test (template→generate→approve→send-once→bounce)
- [ ] Real letter template text + PDF rendering are placeholders: template body needs counsel-approved wording; FakePdfAdapter needs a real PDF engine; rendered PDFs should persist to R2 (documents bucket)
- [ ] Live-verify Clio document upload against the real tenant (human-approved write test, like Phase 3's)
- [ ] Email webhook uses a shared-secret header — replace with the real provider's signature scheme (e.g. Resend/svix) when the email provider lands
- [ ] Follow-up scheduling beyond bounce tasks (DLV-007 full: N-day no-response follow-ups) — needs the jobs queue consumer

#### Phase 6 — Operations (RAD-15, started 2026-07-18)
- [x] Append-only tamper-evident audit trail (DATA-004): hash-chained events (each hash covers content + previous hash), no update/delete path by construction, chain verification detecting edit/deletion/reordering/forgery; D1AuditStore on the baseline audit_events table (no migration needed); wired into conflict disposition, EMT confirm, identity override, letter decision, letter send; staff GET /api/staff/audit with live chain verdict
- [x] Consumer case-status dashboard (UI-001): /status tracker — 7 steps with complete/active/pending/attention states, live actions (identity session, retainer sign + confirm, card checkout, e-Transfer instructions), consumer-safe aggregate endpoint (conflict data never exposed, WF-006); E2E-covered mobile+desktop
- [ ] Staff portal screens (UI-002..006, master client view) — staff APIs exist; screens unbuilt (need Cloudflare Access first for real auth)
- [ ] Magic (21st.dev) MCP returns malformed payloads on both builder and inspiration tools ([object Object] / invalid MCP content) — upstream wrapper bug; component was hand-built this time. Re-test after their next release
- [ ] Ops dashboards (queue depth, dead letters, provider latency, Clio sync lag, payment anomalies, delivery failures — OPS-004), PII-free alerts + runbooks (OPS-005/006), scheduled reconciliation (OPS-007)
- [ ] Audit export + retention/deletion workflows (SEC-011, SEC-014/015)
- [x] Jobs worker is real (2026-07-18): typed queue consumer (zod-validated envelope, malformed→ack, errors→retry→DLQ) + daily cron running the idempotent follow-up sweep (DELIVERED + 14d + no response → FOLLOW_UP_DUE + task, DLV-007/OPS-007). Deploy of the jobs worker is human-gated and still pending
- [ ] Move evidence scanning + post-submit conflict checks onto the queue (message shapes already defined in contracts/jobs.ts); Phase 2 invitation flow (DLV-008) still open
- [ ] Security review pass (TST-005: authz matrix, IDOR, CSRF, XSS, upload attacks, webhook replay, sensitive-log scan) + WCAG 2.2 AA (TST-006) — the production-readiness signoff

#### Product owner / counsel clarification needed (SRS §16 open decisions)
- [ ] All SRS §16 defaults require confirmation before production: operating jurisdiction, evidence rule, payment timing (letter before/after payment differs between AST-167 narrative and SRS default), identity/credit-report retention, client BCC policy, Phase 2 solicitation email rules, Clio tenant conflict-check capabilities, database region/residency, AI provider posture
  - Location: `projects/stopallcalls/docs/BUILD_PLAN.md` (open decisions table)
  - Suggested fix: Review with qualified counsel; record each decision as configuration, not code

#### Factory Infrastructure (found during this build)
- [x] Infisical self-hosted stood up (2026-07-18): `infisical/docker-compose.yml` (Postgres+Redis+server on :8085), instance bootstrapped via admin API, project `factory` (id in `.infisical.json`), 25 dev-tooling secrets migrated from machine env vars; `infisical run` injection verified. Admin creds + machine identity token in gitignored `infisical/.env.admin.local`
- [x] All 28 dev-tooling secrets in Infisical (2026-07-18) incl. TWENTYFIRST_API_KEY / SLACK_BOT_TOKEN / SLACK_TEAM_ID; `scripts/code-with-secrets.ps1` launches VS Code with vault-injected env (verified — 28 vars reach child processes)
- [ ] Cut over: use `scripts/code-with-secrets.ps1` as the VS Code launcher for a few sessions, then delete the `setx` machine env vars (incl. dead `MAGIC21_API_KEY`) so the vault is the single source of truth
- [ ] Back up `infisical/.env` ENCRYPTION_KEY somewhere safe — losing it makes the Infisical DB unrecoverable
- [ ] Finish the 21st.dev Magic swap (2026-07-18): the old `factory-magic21` MCP wrapper pointed at `api.magic21.ai` — a domain that has never existed — so it never worked; replaced with the official `@21st-dev/magic` package in `.mcp.json` and wrapper deleted
  - Location: `.mcp.json` (`magic` server)
  - Suggested fix: Get an API key from the 21st.dev Magic console, `setx TWENTYFIRST_API_KEY "<key>"`, reload VS Code; the stale `MAGIC21_API_KEY` env var can be deleted
- [ ] factory-r2 MCP credentials stale ("SignatureDoesNotMatch") — rotate the R2 API token pair (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) in the Cloudflare dashboard for account c35ddd6d…
- [ ] factory-litellm healthcheck fixed to `/health/liveliness` in `ai/docker-compose.yml` + `config/docker-compose.yml` (was curling the auth-gated `/health`, so the container always showed unhealthy) — needs `docker compose -f ai/docker-compose.yml up -d` to apply; also consider consolidating the duplicate litellm compose files
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
