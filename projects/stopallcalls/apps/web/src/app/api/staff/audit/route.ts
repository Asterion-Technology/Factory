import type { NextRequest } from 'next/server';
import { verifyAuditChain } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getAuditStore } from '@/lib/store';

// DATA-004 / SEC-014: staff view of the audit trail with live chain
// verification — the full chain is always verified so tampering anywhere is
// visible, while the response returns only the most recent events.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const all = await getAuditStore().list();
    const verdict = await verifyAuditChain(all);
    const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '50');
    const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 50;
    return jsonOk({ chain: verdict, events: all.slice(-limit) });
  });
}
