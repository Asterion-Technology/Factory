import type { NextRequest } from 'next/server';
import { emtConfirmRequestSchema } from '@stopallcalls/contracts';
import { confirmEmtPayment } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getPaymentStore } from '@/lib/store';

// PAY-005: billing-staff-only EMT confirmation, actor recorded. Same interim
// admin gate as the other staff routes; the BILLING role is asserted by
// deployment config until Cloudflare Access supplies real identity+role —
// the role check itself lives (and is tested) in the domain service.
export async function POST(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { paymentId } = await params;
    const body = emtConfirmRequestSchema.parse(await req.json());
    const payment = await confirmEmtPayment(getPaymentStore(), paymentId, {
      id: body.confirmedBy,
      role: 'BILLING',
    });
    return jsonOk({ payment: { id: payment.id, state: payment.state, emtConfirmedBy: payment.emtConfirmedBy } });
  });
}
