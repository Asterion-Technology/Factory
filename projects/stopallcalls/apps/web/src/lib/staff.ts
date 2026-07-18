import type { NextRequest } from 'next/server';
import { ServiceError } from '@stopallcalls/db';

// Staff authentication via Cloudflare Access (ADR 0002). Access authenticates
// the staff member at the edge and injects a signed JWT; this module verifies
// it and derives a trustworthy { id, email, role }. The interim
// ALLOW_CLIO_CONNECT switch remains ONLY as the local-dev fallback (no Access
// in front of localhost). In any deployed environment where CF_ACCESS_AUD is
// set, a valid Access JWT is required — unauthenticated callers get an opaque
// 404, identical to the old gate.

export const STAFF_ROLES = ['INTAKE_STAFF', 'LAWYER', 'BILLING', 'ADMIN', 'AUDITOR'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffIdentity {
  id: string;
  email: string;
  role: StaffRole;
}

const isRole = (v: unknown): v is StaffRole => typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);

const NOT_FOUND = new ServiceError(404, 'NOT_FOUND', 'Not found.');

interface AccessPayload {
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  // Access includes IdP groups here when the app is configured to emit them.
  groups?: string[];
  [claim: string]: unknown;
}

let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function fetchAccessKeys(teamDomain: string): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: JsonWebKey[] };
  const keys = body.keys ?? [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

/**
 * Verifies a Cloudflare Access JWT (RS256): signature against the team JWKS,
 * audience contains our AUD tag, issuer is the team domain, and not expired.
 * Returns the decoded payload or throws.
 */
async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<AccessPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as { kid?: string; alg?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected JWT header');

  const keys = await fetchAccessKeys(teamDomain);
  const jwk = keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!jwk) throw new Error('signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlDecode(signatureB64) as BufferSource,
    signed as BufferSource,
  );
  if (!ok) throw new Error('signature verification failed');

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as AccessPayload;
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(aud)) throw new Error('audience mismatch');
  if (payload.iss !== `https://${teamDomain}`) throw new Error('issuer mismatch');
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) throw new Error('token expired');
  return payload;
}

/**
 * Maps a verified Access identity to a staff role. Priority: explicit
 * SAC_STAFF_ROLES map (email → role) for small teams, else an IdP group claim
 * whose name matches a role, else the least-privileged default INTAKE_STAFF.
 */
function resolveRole(email: string, payload: AccessPayload): StaffRole {
  const rolesEnv = process.env.SAC_STAFF_ROLES;
  if (rolesEnv) {
    try {
      const map = JSON.parse(rolesEnv) as Record<string, string>;
      const mapped = map[email.toLowerCase()];
      if (isRole(mapped)) return mapped;
    } catch {
      // Misconfigured map must never widen access — fall through to default.
    }
  }
  for (const group of payload.groups ?? []) {
    const upper = group.toUpperCase();
    if (isRole(upper)) return upper;
  }
  return 'INTAKE_STAFF';
}

/**
 * The single staff authorization entry point. Returns the verified identity or
 * throws an opaque 404. Deployed (CF_ACCESS_AUD set) → Access JWT required;
 * local dev (ALLOW_CLIO_CONNECT=1, no Access) → a dev identity, with
 * x-sac-dev-role choosing the role for testing role-gated flows.
 */
export async function requireStaff(req: NextRequest): Promise<StaffIdentity> {
  const aud = process.env.CF_ACCESS_AUD;
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;

  if (aud && teamDomain) {
    const token = req.headers.get('cf-access-jwt-assertion');
    if (!token) throw NOT_FOUND;
    let payload: AccessPayload;
    try {
      payload = await verifyAccessJwt(token, teamDomain, aud);
    } catch {
      // Never leak why verification failed.
      throw NOT_FOUND;
    }
    const email = payload.email;
    if (!email) throw NOT_FOUND;
    return { id: email, email, role: resolveRole(email, payload) };
  }

  // Local-dev fallback only.
  if (process.env.ALLOW_CLIO_CONNECT === '1') {
    const devRole = req.headers.get('x-sac-dev-role');
    return { id: 'dev-staff', email: 'dev@localhost', role: isRole(devRole) ? devRole : 'ADMIN' };
  }

  throw NOT_FOUND;
}
