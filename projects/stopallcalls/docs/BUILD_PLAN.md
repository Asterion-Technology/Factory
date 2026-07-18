# StopAllCalls — Software Build Plan

Derived from [SRS.md](SRS.md) v1.0 (2026-07-10), attached to Linear issue [AST-167](https://linear.app/asterion1971/issue/AST-167/icd-cease-and-dissist). Tracked in the Linear project **Cease and Dissist** (team Asterion).

## What we are building

A consumer legal-service funnel at **StopAllCalls.com**: intake → evidence upload → Clio conflict check (human disposition) → identity verification → limited-scope retainer → payment (card/Visa debit/EMT) → one Clio matter per collection agency → template-generated cease-and-desist letter → **lawyer approval bound to a content hash** → email delivery with audit trail → follow-up and optional Phase 2 litigation-review invitation.

The app owns the workflow; **Clio Manage is the system of record** for contacts, matters, documents, and the legal audit trail.

## Phases and Linear issues

| Phase | Linear | Deliverables (summary) | Exit criterion |
|---|---|---|---|
| 0 — Foundation | [AST-168](https://linear.app/asterion1971/issue/AST-168) *(In Progress)* | Monorepo, wrangler env templates, domain state machines, D1 schema draft, fake providers, tests | Local setup succeeds from clean clone |
| 1 — Intake MVP | [AST-169](https://linear.app/asterion1971/issue/AST-169) | Landing page, consumer auth/session, multi-step intake, multiple agencies, save/resume, submission snapshot | E2E intake tests pass mobile + desktop |
| 2 — Evidence | [AST-170](https://linear.app/asterion1971/issue/AST-170) | Signed-URL uploads to private R2, quarantine + malware scan, evidence review, chain of custody | Malicious/invalid uploads blocked; clean evidence reviewable |
| 3 — Conflict + Clio | [AST-171](https://linear.app/asterion1971/issue/AST-171) | Clio OAuth, conflict-search package, human disposition, contact mapping, one matter per agency | Retry tests prove no duplicate contacts/matters |
| 4 — Identity/Retainer/Payment | [AST-172](https://linear.app/asterion1971/issue/AST-172) | ID-verification adapter, e-signature, pricing/order, hosted payment, EMT workflow | All gates enforced; webhook replay tests pass |
| 5 — Letters | [AST-173](https://linear.app/asterion1971/issue/AST-173) | Template engine, PDF, lawyer review/diff, hash-bound approval, delivery + Clio upload | No send without exact valid approval; send exactly once |
| 6 — Operations | [AST-174](https://linear.app/asterion1971/issue/AST-174) | Dashboards, follow-up, audit export, retention, observability, runbooks, security review | Production readiness checklist signed off |
| 7 — Optional intelligence | [AST-175](https://linear.app/asterion1971/issue/AST-175) **(DEFERRED)** | Reviewed OCR extraction, constrained AI drafting | Accuracy benchmark, human confirmation, privacy/security approval |

Build strictly in phase order as vertical slices (SRS §15). Phase 7 is disabled by default — SRS §16 sets **AI provider: disabled in initial MVP**.

## Non-negotiable workflow gates (SRS §1.2)

Every gate is domain code with tests, never a UI condition:

1. **Evidence** — ≥1 acceptable proof item or approved attestation, staff-verified before letter approval.
2. **Conflict** — only an authorized human records CLEAR / POSSIBLE_CONFLICT / CONFLICT_FOUND.
3. **Identity** — vendor-verified or documented manual override; mismatch → manual review.
4. **Retainer** — current version signed with immutable evidence.
5. **Payment** — card authorization confirmed or EMT receipt manually confirmed.
6. **Legal approval** — lawyer approves the exact immutable letter hash; any edit invalidates approval.

These align with the Factory-level Human Approval Gates in the root `CLAUDE.md` (payments, auth, and letter sending always require human approval).

## Architecture (SRS §7)

Next.js on Cloudflare Workers (OpenNext) · D1 (relational) · R2 private buckets (evidence/letters) · Queues (Clio sync, scanning, PDF, delivery) · Durable Objects (single-flight locks only where needed) · Cloudflare Access (staff SSO/MFA) · Turnstile/WAF (abuse).

All providers (Clio, payment, identity, signature, email, PDF, AI) are reached only through typed adapters in `packages/integrations` with deterministic fakes for local dev (ARC-002, DEV-003). See [adr/0001-cloudflare-native-stack.md](adr/0001-cloudflare-native-stack.md).

## Phase 0 scope delivered in this PR

- pnpm/TypeScript strict monorepo per SRS §11.1: `apps/web`, `workers/jobs`, `packages/{domain,contracts,db,integrations,testing}`, `infra`, `docs`.
- Intake and matter/letter state machines (SRS §4.1/§4.2) with a single `canTransition()` guard and unit tests (WF-001).
- Gate enum and gate-evaluation types.
- Zod contracts for consumer profile and agency entry (INT-003/INT-005).
- D1 `schema.sql` draft covering the SRS §6 entity table.
- Adapter interfaces + in-memory fakes for Clio, payment, identity, signature, email, PDF.
- Landing-page placeholder with the SRS-approved copy and a Start Intake stub.
- Wrangler environment templates (bindings by name; **no secrets, no real Cloudflare resources yet**).

### Deferred from this PR (tracked in Factory `TODO.md`)

- Real Cloudflare account/resource provisioning (D1/R2/Queues/Access) — requires secrets approval (Factory gate).
- Factory CI workflow integration for this project — `.github/workflows/` changes are human-gated.
- `packages/ui` shared component library — add when Phase 1 needs it (SRS §15: no unused scaffolding).
- Threat-model document — Phase 0 exit item, to be authored with counsel/security review.
- Preview deployment — after Cloudflare provisioning.

## Open decisions requiring sign-off before production (SRS §16)

> ⚠️ **All items below need qualified-counsel and/or product-owner confirmation. Do not hardcode; keep as configuration.**

| Decision | Working default |
|---|---|
| Operating jurisdiction | Configurable country/province/state |
| Evidence rule | ≥1 proof item; attestation only with lawyer override |
| Payment timing | Before matter creation and send |
| Identity retention | Provider-hosted; retain result only |
| Credit report retention | Private R2, limited staff access |
| Client BCC on letters | Off until approved |
| Phase 2 email | Neutral invitation after delivery |
| Clio conflict API behavior | API search + mandatory human review |
| Database region | Closest compliant Cloudflare location |
| AI provider | **Disabled** in initial MVP |

## MVP release acceptance checklist (SRS §17)

- [ ] Clean local clone runs with fake providers and sample data.
- [ ] Public intake protected against abuse and unauthorized data access.
- [ ] One intake creates multiple independent agency matters without duplicates.
- [ ] Conflict/identity/evidence/retainer/payment/approval gates cannot be bypassed via API.
- [ ] Every sent letter approved by an authorized lawyer against the same immutable hash.
- [ ] Evidence and legal documents private, scanned, encrypted as required, access logged.
- [ ] Clio failures, webhook replays, and delivery timeouts recover without duplicate side effects.
- [ ] Security, privacy, accessibility, backup/recovery, and runbooks reviewed.
- [ ] Jurisdictional text, fee handling, retainer language, retention, and delivery policy approved by qualified counsel.
