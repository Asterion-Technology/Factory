# Infrastructure

Wrangler configuration templates for the Cloudflare-native architecture (SRS §7).

**No real Cloudflare resources exist yet.** Provisioning D1/R2/Queues/Access and
adding any secret requires the Factory human-approval gate (secrets, deploys).
Binding names below are canonical; IDs are placeholders to be filled during
provisioning, per environment (dev / preview / staging / production — OPS-001).

| File | Deploys |
|---|---|
| `wrangler.web.jsonc` | `apps/web` via OpenNext (`@opennextjs/cloudflare`) |
| `wrangler.jobs.jsonc` | `workers/jobs` queue consumers |

Rules (ARC-007):

- Secrets only via `wrangler secret put` / dashboard — never in these files.
- R2 buckets are private; access is via signed URLs generated after authorization (ARC-005).
- Production deploys go through CI with manual approval (OPS-002); never `wrangler deploy` to production from a laptop.
