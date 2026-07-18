import type { NextRequest } from 'next/server';
import { runConflictCheck } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getClioAdapter } from '@/lib/clio';
import { getConflictCheckStore, getIntakeStore } from '@/lib/store';

// CLIO-002/003 staff workspace, read + (re-)run. Interim admin gate
// (ALLOW_CLIO_CONNECT) until Cloudflare Access provides staff identity;
// unauthorized callers see the same 404 as a missing route.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const check = await getConflictCheckStore().getByIntake(id);
    if (!check) return jsonError(404, 'NO_CONFLICT_CHECK', 'No conflict check recorded for this intake.');
    return jsonOk({ check });
  });
}

/** Idempotent per intake — a recorded check (and its disposition) is returned as-is. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const intake = await getIntakeStore().getById(id);
    if (!intake) return jsonError(404, 'NOT_FOUND', 'Intake not found.');
    const check = await runConflictCheck(getConflictCheckStore(), await getClioAdapter(), intake);
    return jsonOk({ check });
  });
}
