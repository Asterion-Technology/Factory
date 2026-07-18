import { NextResponse } from 'next/server';
import { verifyAuditChain } from '@stopallcalls/db';
import { jsonError, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getAuditStore } from '@/lib/store';

// SEC-011/SEC-014: audit-trail export as NDJSON. Line 1 is an export manifest
// with the live chain verdict, so a tampered trail is visible in the export
// itself; every following line is one event in chain order.
export async function GET() {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const events = await getAuditStore().list();
    const chain = await verifyAuditChain(events);
    const lines = [
      JSON.stringify({ kind: 'audit-export', exportedAt: new Date().toISOString(), events: events.length, chain }),
      ...events.map((event) => JSON.stringify(event)),
    ];
    return new NextResponse(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': 'attachment; filename="audit-trail.ndjson"',
        'Cache-Control': 'no-store',
      },
    });
  });
}
