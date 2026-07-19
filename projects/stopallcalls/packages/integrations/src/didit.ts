// RAD-26: real identity verification via didit.me, implementing the
// IdentityAdapter port (IDV-001..003 contract unchanged). Provider-hosted
// flow — this app never touches documents or biometrics; didit receives only
// the opaque intake id as vendor_data, never PII.
//
// Selection follows the Turnstile/Resend pattern: the app uses this adapter
// only when DIDIT_API_KEY + DIDIT_WEBHOOK_SECRET + DIDIT_WORKFLOW_ID are
// configured; the fake stays the DEV-003 default and E2E never touches the
// network.
//
// Session idempotency: didit reuses an unfinished session when the same
// vendor_data is submitted on the same workflow version, and our domain layer
// (startIdentityVerification) is idempotent per intake on top of that — the
// port's idempotencyKey needs no extra header.
//
// Webhooks: HMAC-SHA256 over the exact raw body, X-Signature header,
// constant-time compare; body timestamp must be within ±5 minutes (the HMAC
// covers the timestamp field, so replaying an old signed body fails
// freshness). Only `status.updated` events change state; other authentic
// event types are acked and ignored.
//
// PII rule: failures surface only HTTP status codes — never response bodies,
// session URLs, or tokens.

import type { IdentityAdapter, IdentityStatus, IdentityWebhookParseResult } from './types';

const DEFAULT_BASE_URL = 'https://verification.didit.me';
const WEBHOOK_FRESHNESS_SECONDS = 300;

// IDV-004: a provider decline routes to human review (MISMATCH), never to an
// automatic hard fail. Expired/abandoned sessions fail closed but remain
// staff-overridable (IDV-005).
const STATUS_MAP: Record<string, IdentityStatus> = {
  'Not Started': 'PENDING',
  'In Progress': 'PENDING',
  'Awaiting User': 'PENDING',
  'Resubmitted': 'PENDING',
  'In Review': 'PENDING',
  Approved: 'VERIFIED',
  Declined: 'MISMATCH',
  Expired: 'FAILED',
  'Kyc Expired': 'FAILED',
  Abandoned: 'FAILED',
};

export interface DiditConfig {
  apiKey: string;
  workflowId: string;
  webhookSecret: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock (ms) keeps webhook-freshness tests deterministic. */
  nowMs?: () => number;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class DiditIdentityAdapter implements IdentityAdapter {
  readonly webhookSignatureHeader = 'x-signature';

  private readonly apiKey: string;
  private readonly workflowId: string;
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nowMs: () => number;

  constructor(config: DiditConfig) {
    this.apiKey = config.apiKey;
    this.workflowId = config.workflowId;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.nowMs = config.nowMs ?? (() => Date.now());
  }

  async createSession(input: {
    idempotencyKey: string;
    clientRef: string;
  }): Promise<{ providerRef: string; sessionUrl: string }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v3/session/`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_id: this.workflowId, vendor_data: input.clientRef }),
    });
    if (!res.ok) {
      throw new Error(`didit session create failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { session_id?: string; url?: string };
    if (!body.session_id || !body.url) {
      throw new Error('didit session create failed: malformed response');
    }
    return { providerRef: body.session_id, sessionUrl: body.url };
  }

  async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    const expected = await this.hmacHex(payload);
    return timingSafeEqual(expected, signature.trim().toLowerCase());
  }

  parseWebhookEvent(raw: string): IdentityWebhookParseResult {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { kind: 'invalid' };
    }
    if (body.webhook_type !== 'status.updated') return { kind: 'ignored' };

    const ts = Number(body.timestamp ?? body.created_at);
    if (!Number.isFinite(ts) || Math.abs(this.nowMs() / 1000 - ts) > WEBHOOK_FRESHNESS_SECONDS) {
      return { kind: 'stale' };
    }
    const status = STATUS_MAP[String(body.status)];
    const sessionId = body.session_id;
    if (!status || typeof sessionId !== 'string' || !sessionId) return { kind: 'invalid' };

    return {
      kind: 'event',
      event: {
        // event_id is didit's idempotency token (retained across retries);
        // the composite fallback still dedupes identical redeliveries.
        eventId: typeof body.event_id === 'string' && body.event_id ? body.event_id : `${sessionId}:${ts}:${String(body.status)}`,
        providerRef: sessionId,
        status,
      },
    };
  }

  async getResult(providerRef: string): Promise<{
    status: IdentityStatus;
    checks: Record<string, 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'>;
  }> {
    const res = await this.fetchImpl(`${this.baseUrl}/v3/session/${encodeURIComponent(providerRef)}/decision/`, {
      headers: { 'x-api-key': this.apiKey },
    });
    if (!res.ok) {
      throw new Error(`didit decision fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { status?: string };
    const status = STATUS_MAP[String(body.status)];
    if (!status) {
      throw new Error('didit decision fetch failed: unknown status');
    }
    // Redacted per-check extraction from didit's decision object is deferred
    // (RAD-26 out of scope) — the gate runs on status alone.
    return { status, checks: {} };
  }

  private async hmacHex(payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
