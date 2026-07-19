import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { MARKET_STATUSES, isMarketCode } from '@stopallcalls/domain';
import { ServiceError } from '@stopallcalls/db';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { recordAudit } from '@/lib/audit';
import { requireStaff } from '@/lib/staff';
import { getMarketStore } from '@/lib/store';

// UI-006: a market flip is a high-impact configuration change — ADMIN only,
// always audited with before/after. The UI adds the confirmation step; this
// route is the enforcement.
const patchSchema = z.object({
  status: z.enum(MARKET_STATUSES).optional(),
  regions: z.array(z.string().trim().toUpperCase().length(2)).max(64).optional(),
});

export async function PUT(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  return withErrorHandling(async () => {
    const staff = await requireStaff(req);
    if (staff.role !== 'ADMIN') throw new ServiceError(404, 'NOT_FOUND', 'Not found.');
    const { code } = await ctx.params;
    if (!isMarketCode(code)) throw new ServiceError(404, 'NOT_FOUND', 'Not found.');
    const patch = patchSchema.parse(await req.json());
    const store = getMarketStore();
    const before = await store.get(code);
    if (!before) throw new ServiceError(404, 'NOT_FOUND', 'Not found.');
    const after = await store.update(code, patch, staff.email, new Date().toISOString());
    await recordAudit({
      actorId: staff.email,
      actorType: 'STAFF',
      action: 'MARKET_CONFIG_CHANGED',
      entity: 'market',
      entityId: code,
      detail: {
        beforeStatus: before.status,
        afterStatus: after!.status,
        beforeRegions: before.regions.join(','),
        afterRegions: after!.regions.join(','),
      },
    });
    return jsonOk({ market: after });
  });
}
