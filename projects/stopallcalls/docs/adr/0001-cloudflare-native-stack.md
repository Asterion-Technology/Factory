# ADR 0001 — Cloudflare-native stack behind typed adapters

- Status: Accepted
- Date: 2026-07-10
- Related: AST-167, AST-168, SRS §7 / §11

## Context

The SRS attached to AST-167 mandates a Cloudflare-native architecture: Next.js on Workers via OpenNext, D1 for relational data, private R2 buckets for evidence and letters, Queues for asynchronous work, Durable Objects for single-flight coordination, Cloudflare Access for staff SSO/MFA, and Turnstile/WAF for abuse prevention.

This diverges from the Factory's usual application stack (Next.js on Railway with Neon Postgres/Prisma, as in `projects/notary-control-hub` and Haven). The divergence is deliberate: the product handles sensitive legal PII and evidence, and the SRS ties edge security, storage locality, and zero-egress object storage to that platform.

## Decision

1. Follow the SRS: build Cloudflare-native (Workers + D1 + R2 + Queues + Access + Turnstile).
2. Enforce SRS ARC-002 as the escape hatch: **domain logic never imports provider SDKs**. Persistence, storage, queue, identity, payment, signature, Clio, PDF, email, and AI are accessed only through typed adapter interfaces in `packages/integrations`, with deterministic in-memory fakes for local development (DEV-003).
3. Keep all Cloudflare bindings named in wrangler templates under `infra/`; no real resources are provisioned until secrets/account access passes the Factory human-approval gate.

## Consequences

- Local development runs entirely on fakes plus Wrangler emulation — no real Clio, payment, identity, or email credentials (DEV-003/DEV-004).
- If D1 limits bite later (e.g., transaction semantics, size), the `packages/db` repository layer can be re-pointed at Postgres (Neon/Hyperdrive) without touching domain code — that change would require a new ADR.
- CI/deploy targets Cloudflare preview/staging/production environments (OPS-001..003) instead of the Factory's Railway pipeline; the Factory still owns gates (PR review, human production approval).
