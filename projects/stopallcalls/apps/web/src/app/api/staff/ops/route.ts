import type { NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { collectOpsMetrics, verifyAuditChain, type D1Like } from '@stopallcalls/db';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';
import { getAuditStore } from '@/lib/store';

// OPS-004/OPS-005: pull-based operational summary — aggregate counts only,
// never PII. Database-backed metrics require the D1 backend; in local
// fake-store dev the endpoint reports itself unavailable rather than lying
// with zeros. Queue depth / request errors live in Workers observability.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireStaff(req);
    const auditEvents = await getAuditStore().list();
    const chain = await verifyAuditChain(auditEvents);
    if (process.env.SAC_BACKEND !== 'cloudflare') {
      return jsonOk({ available: false, reason: 'Metrics require the D1 backend.', audit: chain });
    }
    const db = (getCloudflareContext().env as unknown as { DB: D1Like }).DB;
    const metrics = await collectOpsMetrics(db);
    return jsonOk({ available: true, metrics, audit: chain });
  });
}
