import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { sendApprovedLetter } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getClioAdapter } from '@/lib/clio';
import { computeGatesForMatter } from '@/lib/gates';
import {
  getApprovalStore,
  getDeliveryStore,
  getEmailAdapter,
  getLetterVersionStore,
  getMatterStore,
} from '@/lib/store';

// DLV-001..005 + exit criterion: exactly-once send of the exact approved
// content, with every gate re-verified at the moment of sending. Client BCC
// is policy config (DLV-003), never a request field.

const sendRequestSchema = z.object({
  letterVersionId: z.string().uuid(),
  recipient: z.string().email(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ matterId: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { matterId } = await params;
    const body = sendRequestSchema.parse(await req.json());
    const matter = await getMatterStore().getById(matterId);
    if (!matter) return jsonError(404, 'NOT_FOUND', 'Matter not found.');
    const sender = process.env.SAC_LETTER_SENDER;
    if (!sender) return jsonError(409, 'SENDER_NOT_CONFIGURED', 'The firm sender address is not configured.');

    const delivery = await sendApprovedLetter(
      {
        versions: getLetterVersionStore(),
        approvals: getApprovalStore(),
        deliveries: getDeliveryStore(),
        matters: getMatterStore(),
        email: getEmailAdapter(),
        clio: await getClioAdapter(),
      },
      {
        letterVersionId: body.letterVersionId,
        recipient: body.recipient,
        senderAddress: sender,
        gates: await computeGatesForMatter(matter),
        ...(process.env.SAC_CLIENT_BCC ? { bccClient: process.env.SAC_CLIENT_BCC } : {}),
      },
    );
    return jsonOk({
      delivery: {
        id: delivery.id,
        status: delivery.status,
        recipient: delivery.recipient,
        artifactHash: delivery.artifactHash,
      },
    });
  });
}
