# StopAllCalls — Agent Rules

This project is a legal-services workflow with hard human-approval gates. These rules distill SRS §15 ([docs/SRS.md](docs/SRS.md)) and are binding for any coding agent working in this directory. They add to — never replace — the Factory-level Human Approval Gates in the repo-root `CLAUDE.md`.

## Never

- Bypass, weaken, or UI-only-enforce a workflow gate (Evidence, Conflict, Identity, Retainer, Payment, Legal approval). Gates are domain code with tests.
- Let the system clear a conflict, decide someone has a legal claim, or send a letter without an authorized human approval recorded.
- Import a provider SDK (Clio, payment, identity, signature, email, PDF, AI) outside `packages/integrations`. React components never call providers.
- Commit secrets, tokens, or real credentials. Wrangler secrets only; `.env.example` stays placeholder-only.
- Log request bodies on sensitive routes, or put PII, account numbers, tokens, intake IDs, or signed URLs in URLs, logs, or analytics events.
- Use real PII in tests or seeds — fixtures are fictitious and clearly marked.
- Send or persist AI output as a legal decision; AI drafting (Phase 7) is disabled by default.
- Weaken a test or delete an assertion to make CI pass.

## Always

- Build in SRS §14 phase order as vertical slices; do not scaffold unused future complexity.
- Route every state change through `packages/domain` transition guards (`canTransition`); clients request transitions, they never assign states (WF-001).
- Give every external side effect an idempotency key and persist attempt metadata (WF-003); retries must not duplicate contacts, matters, payments, or letter sends (WF-004).
- Bind letter approval to the exact content hash; any content change invalidates approval (WF-005 / LTR-007).
- Runtime-validate all API inputs and integration payloads with the Zod schemas in `packages/contracts` (ARC-003).
- Use fake adapters by default locally; sandbox adapters only via explicit configuration (DEV-003).
- Write or update an ADR in `docs/adr/` before changing architecture.
- When a legal policy is uncertain, add a configuration placeholder and record the open decision in `docs/BUILD_PLAN.md` — never invent a legal rule.
- State security/privacy impact, migrations, new secrets, provider effects, tests, and rollback in every PR.

## Commands

`pnpm install` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm dev` (see README).
