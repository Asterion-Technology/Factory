import type { NextRequest } from 'next/server';
import { identityOverrideRequestSchema } from '@stopallcalls/contracts';
import { recordIdentityOverride } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { clioConnectEnabled } from '@/lib/clio';
import { getIdentityStore } from '@/lib/store';

// IDV-005: audited manual override — actor and reason are mandatory and
// permanently recorded. Interim admin gate until Cloudflare Access.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const body = identityOverrideRequestSchema.parse(await req.json());
    const record = await getIdentityStore().getByIntake(id);
    if (!record) return jsonError(404, 'NOT_FOUND', 'No verification exists for this intake.');
    const overridden = await recordIdentityOverride(getIdentityStore(), record.id, body);
    await recordAudit({
      actorId: body.overriddenBy,
      actorType: 'STAFF',
      action: 'IDENTITY_OVERRIDE_RECORDED',
      entity: 'identity_verification',
      entityId: overridden.id,
    });
    return jsonOk({
      verification: {
        id: overridden.id,
        status: overridden.status,
        overrideBy: overridden.overrideBy,
        overrideReason: overridden.overrideReason,
      },
    });
  });
}
