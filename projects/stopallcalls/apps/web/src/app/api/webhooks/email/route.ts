import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordDeliveryEvent } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getDeliveryStore, getMatterStore, getTaskStore } from '@/lib/store';

// DLV-006/DLV-007: provider delivery events. Fails closed: without the shared
// webhook secret configured, the endpoint does not exist. Real provider
// signature verification (e.g. Resend svix) replaces this when email lands.
const emailEventSchema = z.object({
  providerMessageId: z.string().min(1).max(200),
  status: z.enum(['DELIVERED', 'BOUNCED']),
});

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    const secret = process.env.SAC_EMAIL_WEBHOOK_SECRET;
    if (!secret) return jsonError(404, 'NOT_FOUND', 'Not found.');
    if (req.headers.get('x-webhook-secret') !== secret) {
      return jsonError(401, 'INVALID_SIGNATURE', 'Webhook verification failed.');
    }
    const body = emailEventSchema.parse(await req.json());
    const delivery = await recordDeliveryEvent(
      { deliveries: getDeliveryStore(), matters: getMatterStore(), tasks: getTaskStore() },
      body,
    );
    return jsonOk({ received: true, status: delivery.status });
  });
}
