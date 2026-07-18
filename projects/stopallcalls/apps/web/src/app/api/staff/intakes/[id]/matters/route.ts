import type { NextRequest } from 'next/server';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';
import { getMatterStore } from '@/lib/store';

// UI-004: the per-agency matter list under one intake — workflow state and
// Clio display number only; letter content lives on the matter workspace.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    await requireStaff(req);
    const { id } = await ctx.params;
    const matters = await getMatterStore().listByIntake(id);
    return jsonOk({
      matters: matters.map((m) => ({
        id: m.id,
        agencyId: m.agencyId,
        displayNumber: m.displayNumber,
        state: m.state,
        updatedAt: m.updatedAt,
      })),
    });
  });
}
