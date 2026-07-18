import type { NextRequest } from 'next/server';
import { paymentWebhookEventSchema } from '@stopallcalls/contracts';
import { applyPaymentWebhook } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getPaymentAdapter, getPaymentStore } from '@/lib/store';

// PAY-004: no session — authentication IS the provider signature over the raw
// body. Applied idempotently by eventId; replays are successful no-ops.
export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const signature = req.headers.get('x-webhook-signature');
    if (!signature) return jsonError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed.');
    const raw = await req.text();
    const event = paymentWebhookEventSchema.parse(JSON.parse(raw));
    const payment = await applyPaymentWebhook(getPaymentStore(), getPaymentAdapter(), raw, signature, event);
    return jsonOk({ received: true, state: payment.state });
  });
}
