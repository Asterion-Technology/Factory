# ADR 0002 — Staff authentication via Cloudflare Access

Status: Accepted (2026-07-18) · Supersedes the interim `ALLOW_CLIO_CONNECT=1` gate

## Context

Every staff surface (`/staff`, `/api/staff/*`, the Clio OAuth connect routes) is
currently protected only by the interim env switch `ALLOW_CLIO_CONNECT=1`. That
is a build-time on/off flag, not authentication: it carries no identity, no
role, and no MFA. Staff actions (conflict dispositions, EMT confirmations,
identity overrides, letter approvals/sends) are legally significant and the
audit trail records an actor id that today comes from a request body field —
spoofable. SRS §15 requires authenticated, role-bound staff identity.

Cloudflare Access (Zero Trust) sits in front of the Worker, authenticates the
staff member against an IdP (with MFA), and injects a signed JWT the app
verifies to obtain a trustworthy identity + role.

## Decision

Protect the staff hostname/paths with a **self-hosted Access application**, and
verify the injected Access JWT in the Worker (`lib/staff.ts`) to derive
`{ id, email, role }`. The interim env gate remains only as the **local-dev
fallback** (no Access in front of `localhost`); in any deployed environment the
Access JWT is required.

### Prerequisite: a custom domain

Access **cannot** protect a raw `*.workers.dev` hostname (that zone is
Cloudflare's, not ours). Add a **Custom Domain** to the web Worker on a zone we
control — e.g. `app.stopallcalls.<domain>` — and apply Access to that hostname.
Until a custom domain exists, staff auth stays on the interim gate.

## Setup (Cloudflare dashboard — human-gated, one-time)

1. **Zone + custom domain**: add the zone to Cloudflare; on the web Worker →
   Settings → Domains & Routes → add Custom Domain `app.stopallcalls.<domain>`.
2. **Identity provider**: Zero Trust → Settings → Authentication → add an IdP
   (Google Workspace / Entra / One-time PIN for a small team). Require MFA on
   the IdP.
3. **Access application** (Zero Trust → Access → Applications → Add →
   Self-hosted):
   - Application domain: `app.stopallcalls.<domain>` with path `/staff` and a
     second app (or wildcard) for `/api/staff/*` and `/api/oauth/clio/*`.
   - Session duration: short (e.g. 8h).
   - Note the **Application Audience (AUD) tag** — it goes in `CF_ACCESS_AUD`.
4. **Policies**: allow only staff — e.g. emails ending `@<firm-domain>`, or
   specific IdP groups. Create one policy per role group if the IdP emits
   groups (Lawyers, Billing, Intake, Admin, Auditor).
5. **Roles → the app**: either
   - map IdP **groups** to roles (Access includes them in the JWT claims), or
   - set `SAC_STAFF_ROLES` (JSON `{"lawyer@firm":"LAWYER", ...}`) as a wrangler
     var for a small team.
   Default role for an authenticated-but-unmapped staffer is `INTAKE_STAFF`
   (read + intake actions only; never LAWYER/BILLING).
6. **Worker secrets/vars**: `wrangler secret put`/vars —
   `CF_ACCESS_TEAM_DOMAIN` (`<team>.cloudflareaccess.com`), `CF_ACCESS_AUD`
   (the AUD tag), and optionally `SAC_STAFF_ROLES`. Then remove
   `ALLOW_CLIO_CONNECT` from the deployed environment.

## How the app verifies (this repo)

`lib/staff.ts` → `requireStaff(req)`:
- Reads the Access JWT from the `Cf-Access-Jwt-Assertion` header (Access also
  sets the `CF_Authorization` cookie; the header is canonical for API calls).
- Verifies RS256 against the team JWKS
  (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cached), checks
  `aud` contains `CF_ACCESS_AUD`, `iss` is the team domain, and `exp`.
- Derives role from the group claim or `SAC_STAFF_ROLES`; returns
  `{ id: email, email, role }`.
- If `CF_ACCESS_AUD` is unset (local dev) and `ALLOW_CLIO_CONNECT=1`, returns a
  dev identity so `pnpm dev`/E2E keep working; a request-supplied
  `x-sac-dev-role` may set the role for local testing only.
- Otherwise throws the same opaque 404 the interim gate returned.

Once every staff route calls `requireStaff`, the audit `actorId` comes from the
verified Access identity instead of a request body field, closing the
spoofable-actor gap, and the domain role checks (LAWYER/BILLING) are enforced
against real roles.

## Consequences

- Staff auth requires the custom-domain + Access setup above before it is real;
  local dev and CI are unaffected (fallback path).
- Verified identity + role removes the interim gate's blindness and hardens the
  audit trail's actor attribution.
- Follow-up: restore the `conflict_checks.reviewed_by → users(id)` and other
  staff FKs (relaxed to TEXT in migrations 0002–0004) once identities are
  provisioned from Access.
