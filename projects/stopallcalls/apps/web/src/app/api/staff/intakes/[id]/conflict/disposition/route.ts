import type { NextRequest } from 'next/server';
import { conflictDispositionRequestSchema } from '@stopallcalls/contracts';
import { recordConflictDisposition } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getConflictCheckStore } from '@/lib/store';

// CLIO-003: a human records the disposition exactly once. Same interim admin
// gate as the connect flow; reviewedBy is the staff identifier until
// Cloudflare Access supplies an authenticated identity.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const body = conflictDispositionRequestSchema.parse(await req.json());
    const store = getConflictCheckStore();
    const check = await store.getByIntake(id);
    if (!check) return jsonError(404, 'NO_CONFLICT_CHECK', 'No conflict check recorded for this intake.');
    const decided = await recordConflictDisposition(store, check.id, body);
    return jsonOk({ check: decided });
  });
}
