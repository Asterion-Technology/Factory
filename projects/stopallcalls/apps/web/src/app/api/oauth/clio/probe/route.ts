import type { NextRequest } from 'next/server';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getRealClioAdapter } from '@/lib/clio';

// Read-only ops probe (same interim admin gate): exercises the real adapter's
// contact search against the live tenant. Returns counts and names only.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const query = req.nextUrl.searchParams.get('q')?.trim();
    if (!query) return jsonError(422, 'QUERY_REQUIRED', 'Pass ?q=<search text>.');
    const contacts = await getRealClioAdapter().searchContacts(query);
    return jsonOk({ count: contacts.length, sample: contacts.slice(0, 3).map((c) => c.name) });
  });
}
