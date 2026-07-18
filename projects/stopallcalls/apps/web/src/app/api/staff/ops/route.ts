import { getCloudflareContext } from '@opennextjs/cloudflare';
import { collectOpsMetrics, verifyAuditChain, type D1Like } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getAuditStore } from '@/lib/store';

// OPS-004/OPS-005: pull-based operational summary — aggregate counts only,
// never PII. Database-backed metrics require the D1 backend; in local
// fake-store dev the endpoint reports itself unavailable rather than lying
// with zeros. Queue depth / request errors live in Workers observability.
export async function GET() {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
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
