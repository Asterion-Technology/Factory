import type { NextRequest } from 'next/server';
import { ServiceError, toClientIntake } from '@stopallcalls/db';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';
import { getIntakeStore } from '@/lib/store';

// UI-003: master client view source — the full intake record (profile,
// agencies, submitted snapshot, gate state) without the ownership handle.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    await requireStaff(req);
    const { id } = await ctx.params;
    const record = await getIntakeStore().getById(id);
    if (!record) throw new ServiceError(404, 'NOT_FOUND', 'Not found.');
    return jsonOk({ intake: toClientIntake(record) });
  });
}
