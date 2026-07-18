import type { D1Like } from './d1';

// Phase 6 (OPS-004): operational metrics pulled straight from D1 — request
// errors and queue depth live in Workers observability; everything the
// database can answer is aggregated here. Counts only, never PII (OPS-005).

export interface OpsMetrics {
  intakesByState: Record<string, number>;
  evidence: { total: number; infected: number; pendingScan: number };
  conflicts: { undecided: number };
  identity: { underReview: number; failed: number };
  payments: { failed: number; awaitingEmt: number; settled: number };
  deliveries: { sent: number; delivered: number; bounced: number };
  tasks: { open: number };
  letters: { inReview: number; approved: number };
}

interface CountRow {
  key: string;
  n: number;
}

async function groupCount(db: D1Like, sql: string): Promise<Record<string, number>> {
  const { results } = await db.prepare(sql).all<CountRow>();
  return Object.fromEntries(results.map((r) => [r.key, r.n]));
}

export async function collectOpsMetrics(db: D1Like): Promise<OpsMetrics> {
  const intakes = await groupCount(db, 'SELECT state AS key, COUNT(*) AS n FROM intakes GROUP BY state');
  const evidence = await groupCount(db, 'SELECT scan_status AS key, COUNT(*) AS n FROM evidence_files GROUP BY scan_status');
  const identity = await groupCount(db, 'SELECT status AS key, COUNT(*) AS n FROM identity_verifications GROUP BY status');
  const payments = await groupCount(db, 'SELECT status AS key, COUNT(*) AS n FROM payments GROUP BY status');
  const deliveries = await groupCount(db, 'SELECT status AS key, COUNT(*) AS n FROM deliveries GROUP BY status');
  const letters = await groupCount(db, 'SELECT status AS key, COUNT(*) AS n FROM letter_versions GROUP BY status');
  const undecided = await db
    .prepare('SELECT COUNT(*) AS n FROM conflict_checks WHERE disposition IS NULL')
    .first<{ n: number }>();
  const openTasks = await db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'OPEN'").first<{ n: number }>();

  const sum = (source: Record<string, number>, keys: string[]) =>
    keys.reduce((total, key) => total + (source[key] ?? 0), 0);

  return {
    intakesByState: intakes,
    evidence: {
      total: Object.values(evidence).reduce((a, b) => a + b, 0),
      infected: evidence.INFECTED ?? 0,
      pendingScan: sum(evidence, ['PENDING_UPLOAD', 'QUARANTINED', 'SCANNING']),
    },
    conflicts: { undecided: undecided?.n ?? 0 },
    identity: {
      underReview: sum(identity, ['MISMATCH_REVIEW']),
      failed: identity.FAILED ?? 0,
    },
    payments: {
      failed: payments.FAILED ?? 0,
      awaitingEmt: payments.AWAITING_EMT ?? 0,
      settled: sum(payments, ['AUTHORIZED', 'PAID', 'EMT_CONFIRMED']),
    },
    deliveries: {
      sent: deliveries.SENT ?? 0,
      delivered: deliveries.DELIVERED ?? 0,
      bounced: deliveries.BOUNCED ?? 0,
    },
    tasks: { open: openTasks?.n ?? 0 },
    letters: {
      inReview: letters.IN_REVIEW ?? 0,
      approved: letters.APPROVED ?? 0,
    },
  };
}
