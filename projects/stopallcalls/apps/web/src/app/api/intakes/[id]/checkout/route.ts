import type { NextRequest } from 'next/server';
import { checkoutRequestSchema } from '@stopallcalls/contracts';
import {
  createOrderForIntake,
  getOwnedIntake,
  startEmtPayment,
  startHostedPayment,
} from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getPricingConfig } from '@/lib/pricing';
import { getIntakeStore, getOrderStore, getPaymentAdapter, getPaymentStore } from '@/lib/store';

// PAY-001..005: server-calculated order + hosted checkout or EMT flow. The
// client only ever chooses a method; amounts come from config + snapshot.

const clientPayment = (p: { id: string; method: string; state: string; amountCents: number; currency: string }) => ({
  id: p.id,
  method: p.method,
  state: p.state,
  amountCents: p.amountCents,
  currency: p.currency,
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const body = checkoutRequestSchema.parse(await req.json());
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const order = await createOrderForIntake(getOrderStore(), getPricingConfig(), intake);

    if (body.method === 'EMT') {
      const payment = await startEmtPayment(getPaymentStore(), order);
      return jsonOk({
        order: { id: order.id, totalCents: order.totalCents, currency: order.currency, items: order.pricing.items },
        payment: clientPayment(payment),
        // PAY-005 placeholder: approved instructions text is config, pending counsel.
        emtInstructions: process.env.SAC_EMT_INSTRUCTIONS ?? 'EMT instructions are not configured yet.',
      });
    }
    const { payment, redirectUrl } = await startHostedPayment(getPaymentStore(), getPaymentAdapter(), order, body.method);
    return jsonOk({
      order: { id: order.id, totalCents: order.totalCents, currency: order.currency, items: order.pricing.items },
      payment: clientPayment(payment),
      redirectUrl,
    });
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const intake = await getOwnedIntake(getIntakeStore(), session.email, id);
    const order = await getOrderStore().getByIntake(intake.id);
    if (!order) return jsonOk({ order: null, payments: [] });
    const payments = await getPaymentStore().listByOrder(order.id);
    return jsonOk({
      order: { id: order.id, totalCents: order.totalCents, currency: order.currency, items: order.pricing.items },
      payments: payments.map(clientPayment),
    });
  });
}
