import type { NextRequest } from 'next/server';
import { identityWebhookEventSchema } from '@stopallcalls/contracts';
import { applyIdentityWebhook } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getIdentityAdapter, getIdentityStore } from '@/lib/store';

// IDV-003: signed, replay-protected, idempotent — same contract as payments.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const signature = req.headers.get('x-webhook-signature');
    if (!signature) return jsonError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    const raw = await req.text();
    const event = identityWebhookEventSchema.parse(JSON.parse(raw));
    const record = await applyIdentityWebhook(getIdentityStore(), getIdentityAdapter(), raw, signature, event);
    return jsonOk({ received: true, status: record.status });
  });
}
