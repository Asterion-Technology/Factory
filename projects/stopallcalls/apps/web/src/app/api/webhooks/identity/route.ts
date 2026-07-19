import type { NextRequest } from 'next/server';
import { identityWebhookEventSchema } from '@stopallcalls/contracts';
import { applyIdentityWebhook } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getIdentityAdapter, getIdentityStore } from '@/lib/store';

// IDV-003: signed, replay-protected, idempotent — same contract as payments.
// RAD-26: the adapter owns the provider's wire format — signature header name
// and body mapping (didit sends its own envelope; the fake posts the app
// schema directly). Signature is verified on the exact raw bytes BEFORE any
// parsing decision, so even ignored event types must be authentic.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const adapter = getIdentityAdapter();
    const signature = req.headers.get(adapter.webhookSignatureHeader ?? 'x-webhook-signature');
    if (!signature) return jsonError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    const raw = await req.text();
    if (!(await adapter.verifyWebhookSignature(raw, signature))) {
      return jsonError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    }

    let event;
    if (adapter.parseWebhookEvent) {
      const parsed = adapter.parseWebhookEvent(raw);
      if (parsed.kind === 'ignored') return jsonOk({ received: true, ignored: true });
      if (parsed.kind !== 'event') return jsonError(400, 'INVALID_WEBHOOK', 'Webhook payload rejected.');
      event = identityWebhookEventSchema.parse(parsed.event);
    } else {
      event = identityWebhookEventSchema.parse(JSON.parse(raw));
    }

    const record = await applyIdentityWebhook(getIdentityStore(), adapter, raw, signature, event);
    return jsonOk({ received: true, status: record.status });
  });
}
