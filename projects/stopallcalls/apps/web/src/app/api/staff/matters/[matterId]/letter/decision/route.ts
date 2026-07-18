import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { decideLetterApproval, submitLetterForReview } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { clioConnectEnabled } from '@/lib/clio';
import { getApprovalStore, getLetterVersionStore, getMatterStore } from '@/lib/store';

// LTR-007/LTR-008: hash-bound, lawyer-only decision. PUT submits the draft
// into review; POST records the decision. The LAWYER role is asserted by
// deployment config until Cloudflare Access supplies identity+role — the
// role check itself lives (and is tested) in the domain service.

const decisionRequestSchema = z.object({
  letterVersionId: z.string().uuid(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(2000).optional(),
});

const reviewRequestSchema = z.object({ letterVersionId: z.string().uuid() });

export async function PUT(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const body = reviewRequestSchema.parse(await req.json());
    const version = await submitLetterForReview(
      { versions: getLetterVersionStore(), matters: getMatterStore() },
      body.letterVersionId,
    );
    return jsonOk({ version });
  });
}

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const body = decisionRequestSchema.parse(await req.json());
    const result = await decideLetterApproval(
      { versions: getLetterVersionStore(), matters: getMatterStore(), approvals: getApprovalStore() },
      body.letterVersionId,
      {
        actor: { id: body.decidedBy, role: 'LAWYER' },
        contentHash: body.contentHash,
        decision: body.decision,
        ...(body.reason ? { reason: body.reason } : {}),
      },
    );
    await recordAudit({
      actorId: body.decidedBy,
      actorType: 'STAFF',
      action: `LETTER_${body.decision}`,
      entity: 'letter_version',
      entityId: body.letterVersionId,
      detail: { contentHash: body.contentHash },
    });
    return jsonOk(result);
  });
}
