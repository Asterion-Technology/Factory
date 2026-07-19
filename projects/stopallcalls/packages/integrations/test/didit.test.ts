import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DiditIdentityAdapter } from '../src/index';

type Captured = { url: string; init: RequestInit };

function fetchStub(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

const SECRET = 'test-webhook-secret';
const NOW_MS = 1_774_970_000_000; // fixed clock — freshness is relative to this

function adapter(over?: Partial<{ fetchImpl: typeof fetch; nowMs: () => number }>): DiditIdentityAdapter {
  return new DiditIdentityAdapter({
    apiKey: 'didit_test_key',
    workflowId: 'wf-uuid-1',
    webhookSecret: SECRET,
    fetchImpl: over?.fetchImpl ?? (fetchStub(200, {}, []) as typeof fetch),
    nowMs: over?.nowMs ?? (() => NOW_MS),
  });
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

function envelope(over?: Record<string, unknown>): string {
  return JSON.stringify({
    event_id: 'evt-1',
    webhook_type: 'status.updated',
    timestamp: NOW_MS / 1000,
    session_id: 'sess-uuid-1',
    status: 'Approved',
    vendor_data: 'intake-123',
    ...over,
  });
}

describe('DiditIdentityAdapter (RAD-26, IDV-001..003)', () => {
  it('createSession POSTs workflow + vendor_data with the api key and maps the response', async () => {
    const captured: Captured[] = [];
    const a = adapter({
      fetchImpl: fetchStub(201, { session_id: 'sess-1', url: 'https://verify.didit.me/en/session/tok' }, captured),
    });
    const session = await a.createSession({ idempotencyKey: 'idv:intake-123', clientRef: 'intake-123' });

    expect(session).toEqual({ providerRef: 'sess-1', sessionUrl: 'https://verify.didit.me/en/session/tok' });
    expect(captured[0]!.url).toBe('https://verification.didit.me/v3/session/');
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('didit_test_key');
    expect(JSON.parse(String(captured[0]!.init.body))).toEqual({
      workflow_id: 'wf-uuid-1',
      vendor_data: 'intake-123',
    });
  });

  it('createSession failures surface the HTTP status only — no body, url, or key', async () => {
    const a = adapter({ fetchImpl: fetchStub(401, { detail: 'Invalid api key didit_test_key' }, []) });
    await expect(a.createSession({ idempotencyKey: 'k', clientRef: 'intake-1' })).rejects.toThrow(
      /HTTP 401(?!.*didit_test_key)/,
    );
    const malformed = adapter({ fetchImpl: fetchStub(201, { unexpected: true }, []) });
    await expect(malformed.createSession({ idempotencyKey: 'k', clientRef: 'i' })).rejects.toThrow(/malformed/);
  });

  it('verifies HMAC-SHA256 over raw bytes, rejects tampered payloads and wrong secrets', async () => {
    const a = adapter();
    const raw = envelope();
    expect(await a.verifyWebhookSignature(raw, sign(raw))).toBe(true);
    expect(await a.verifyWebhookSignature(raw, sign(raw).toUpperCase())).toBe(true); // case-insensitive hex
    expect(await a.verifyWebhookSignature(raw + ' ', sign(raw))).toBe(false);
    expect(await a.verifyWebhookSignature(raw, createHmac('sha256', 'wrong').update(raw).digest('hex'))).toBe(false);
    expect(await a.verifyWebhookSignature(raw, 'not-a-signature')).toBe(false);
  });

  it('maps status.updated envelopes to app events (Approved→VERIFIED, Declined→MISMATCH, Expired→FAILED)', () => {
    const a = adapter();
    const approved = a.parseWebhookEvent(envelope());
    expect(approved).toEqual({
      kind: 'event',
      event: { eventId: 'evt-1', providerRef: 'sess-uuid-1', status: 'VERIFIED' },
    });
    expect(a.parseWebhookEvent(envelope({ status: 'Declined' }))).toMatchObject({
      event: { status: 'MISMATCH' }, // IDV-004: decline → human review, never auto-fail
    });
    expect(a.parseWebhookEvent(envelope({ status: 'Kyc Expired' }))).toMatchObject({ event: { status: 'FAILED' } });
    expect(a.parseWebhookEvent(envelope({ status: 'In Progress' }))).toMatchObject({ event: { status: 'PENDING' } });
  });

  it('synthesizes a deterministic eventId when event_id is absent', () => {
    const parsed = adapter().parseWebhookEvent(envelope({ event_id: undefined }));
    expect(parsed).toMatchObject({ kind: 'event', event: { eventId: `sess-uuid-1:${NOW_MS / 1000}:Approved` } });
  });

  it('ignores authentic non-status events; rejects stale, unknown, and garbage payloads', () => {
    const a = adapter();
    expect(a.parseWebhookEvent(envelope({ webhook_type: 'data.updated' }))).toEqual({ kind: 'ignored' });
    expect(a.parseWebhookEvent(envelope({ timestamp: NOW_MS / 1000 - 301 }))).toEqual({ kind: 'stale' });
    expect(a.parseWebhookEvent(envelope({ timestamp: NOW_MS / 1000 + 301 }))).toEqual({ kind: 'stale' });
    expect(a.parseWebhookEvent(envelope({ status: 'Weird New Status' }))).toEqual({ kind: 'invalid' });
    expect(a.parseWebhookEvent(envelope({ session_id: '' }))).toEqual({ kind: 'invalid' });
    expect(a.parseWebhookEvent('not json at all')).toEqual({ kind: 'invalid' });
  });

  it('getResult fetches the decision and maps the status, redacting checks', async () => {
    const captured: Captured[] = [];
    const a = adapter({ fetchImpl: fetchStub(200, { status: 'Approved', decision: { secret: 'stuff' } }, captured) });
    const result = await a.getResult('sess-uuid-1');
    expect(result).toEqual({ status: 'VERIFIED', checks: {} });
    expect(captured[0]!.url).toBe('https://verification.didit.me/v3/session/sess-uuid-1/decision/');
    expect((captured[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('didit_test_key');
  });
});
