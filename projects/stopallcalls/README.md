# StopAllCalls

Consumer-facing legal-service application: a lawyer-issued **cease-and-desist letter funnel** for people being contacted by debt collectors. Intake → evidence → Clio conflict check → identity verification → limited-scope retainer → payment → one Clio matter per collection agency → lawyer-approved letter → delivery + follow-up.

**Clio Manage is the system of record.** This app orchestrates the workflow and must never clear a conflict, determine a legal claim, or send a letter without authorized human approval.

- Linear: project **Cease and Dissist** — spec issue [AST-167](https://linear.app/asterion1971/issue/AST-167), phase issues AST-168…AST-175
- Spec: [docs/SRS.md](docs/SRS.md) (converted from [docs/SRS-original.docx](docs/SRS-original.docx))
- Plan: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)
- Architecture: [docs/adr/0001-cloudflare-native-stack.md](docs/adr/0001-cloudflare-native-stack.md)

## Stack

Next.js 15 (App Router) on Cloudflare Workers via OpenNext · Cloudflare D1 · private R2 · Queues · Cloudflare Access (staff) · Turnstile · strict TypeScript pnpm monorepo. All third-party providers (Clio, payment, identity, e-signature, email, PDF) live behind typed adapters in `packages/integrations` with in-memory fakes for local dev.

## Layout

```
apps/web              Next.js public + staff UI
workers/jobs          Queue consumers and scheduled jobs
packages/domain       Entities, state machines, gates, policies
packages/contracts    Zod schemas (API + integration payloads)
packages/db           D1 schema, migrations, repositories
packages/integrations Provider adapter interfaces + fakes
packages/testing      Fictitious fixtures and fake-provider helpers
infra                 Wrangler environment templates (no secrets)
docs                  SRS, build plan, ADRs
```

## Local development

Requires Node.js LTS (≥20) and pnpm ≥9.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm dev        # Next.js dev server (apps/web) on http://localhost:3000
```

No real provider credentials are needed — fakes are the default (`.env.example` documents the variables). Real Cloudflare resources (D1/R2/Queues/Access) are not provisioned yet; see BUILD_PLAN deferred items.

## Phase status

| Phase | Status |
|---|---|
| 0 — Foundation | ✅ scaffolded (AST-168) |
| 1 — Intake MVP | 🔨 in progress (AST-169) — multi-step intake, save/resume, submission snapshot done; email verification, Turnstile, E2E tests remain |
| 2 — Evidence | ⏳ backlog (AST-170) |
| 3 — Conflict + Clio | ⏳ backlog (AST-171) |
| 4 — Identity/Retainer/Payment | ⏳ backlog (AST-172) |
| 5 — Letters | ⏳ backlog (AST-173) |
| 6 — Operations | ⏳ backlog (AST-174) |
| 7 — Optional intelligence | 🚫 deferred (AST-175) |
