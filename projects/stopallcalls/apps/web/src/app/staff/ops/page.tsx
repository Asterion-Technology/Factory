'use client';

import { useEffect, useState } from 'react';
import type { OpsMetrics } from '@stopallcalls/db';
import { INTAKE_STATES } from '@stopallcalls/domain';

interface OpsResponse {
  available: boolean;
  reason?: string;
  metrics?: OpsMetrics;
  audit: { valid: boolean; checked: number; firstBrokenIndex?: number };
}

interface AuditEvent {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorId: string | null;
  occurredAt: string;
}

// Attention tiles surface work waiting on a human; alert tiles surface
// failures. Status is never color alone — the dot pairs with the label, and
// zero-count tiles stay quiet (muted value, no dot).
type Tone = 'attention' | 'alert';

function StatTile({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  const active = value > 0 && tone;
  return (
    <div className={`stat-tile${active ? ` stat-${tone}` : ''}`}>
      <div className={`stat-value${value === 0 ? ' stat-zero' : ''}`}>{value}</div>
      <div className="stat-label">
        {active && <span className={`stat-dot stat-dot-${tone}`} aria-hidden="true" />}
        {label}
      </div>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="stat-group-title">{title}</h3>
      <div className="stat-grid">{children}</div>
    </>
  );
}

const prettyState = (s: string): string => s.replaceAll('_', ' ').toLowerCase();

// OPS-004/OPS-005 + SEC-014 surface: aggregate metrics, live audit-chain
// verdict, and the recent audit tail. Counts and identifiers only — no PII.
export default function StaffOpsPage() {
  const [ops, setOps] = useState<OpsResponse | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/staff/ops').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
      fetch('/api/staff/audit?limit=25').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    ])
      .then(([o, a]) => {
        setOps(o as OpsResponse);
        setEvents((a as { events: AuditEvent[] }).events);
      })
      .catch(() => setError('Could not load operations data.'));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!ops) return <p>Loading…</p>;

  const m = ops.metrics;
  const intakeTotal = m ? Object.values(m.intakesByState).reduce((a, b) => a + b, 0) : 0;
  // Canonical funnel order from the domain state machine; anything the domain
  // doesn't know (defensive) renders after, in name order.
  const knownStates = INTAKE_STATES.filter((s) => (m?.intakesByState[s] ?? 0) > 0);
  const extraStates = m
    ? Object.keys(m.intakesByState)
        .filter((s) => !(INTAKE_STATES as readonly string[]).includes(s))
        .sort()
    : [];

  return (
    <section>
      <h1>Operations</h1>

      <h2>Audit chain</h2>
      <p>
        <span className="staff-tag">{ops.audit.valid ? 'intact' : 'PROBLEM'}</span>{' '}
        <span className="staff-sub">
          {ops.audit.checked} events verified
          {ops.audit.firstBrokenIndex != null ? ` — first break at #${ops.audit.firstBrokenIndex}` : ''}
        </span>
      </p>

      <h2>Metrics</h2>
      {!ops.available && <p className="staff-sub">{ops.reason ?? 'Unavailable in this environment.'}</p>}
      {ops.available && m && (
        <>
          <StatGroup title={`Intake pipeline · ${intakeTotal} total`}>
            {[...knownStates, ...extraStates].map((s) => (
              <StatTile key={s} label={prettyState(s)} value={m.intakesByState[s] ?? 0} />
            ))}
            {intakeTotal === 0 && <p className="staff-sub">No intakes yet.</p>}
          </StatGroup>

          <StatGroup title="Needs a human">
            <StatTile label="undecided conflicts" value={m.conflicts.undecided} tone="attention" />
            <StatTile label="identity in review" value={m.identity.underReview} tone="attention" />
            <StatTile label="awaiting EMT confirm" value={m.payments.awaitingEmt} tone="attention" />
            <StatTile label="letters in review" value={m.letters.inReview} tone="attention" />
            <StatTile label="open tasks" value={m.tasks.open} tone="attention" />
            <StatTile label="scans pending" value={m.evidence.pendingScan} tone="attention" />
          </StatGroup>

          <StatGroup title="Failures">
            <StatTile label="infected uploads" value={m.evidence.infected} tone="alert" />
            <StatTile label="identity failed" value={m.identity.failed} tone="alert" />
            <StatTile label="payments failed" value={m.payments.failed} tone="alert" />
            <StatTile label="deliveries bounced" value={m.deliveries.bounced} tone="alert" />
          </StatGroup>

          <StatGroup title="Throughput">
            <StatTile label="evidence files" value={m.evidence.total} />
            <StatTile label="payments settled" value={m.payments.settled} />
            <StatTile label="letters approved" value={m.letters.approved} />
            <StatTile label="letters sent" value={m.deliveries.sent} />
            <StatTile label="letters delivered" value={m.deliveries.delivered} />
          </StatGroup>
        </>
      )}

      <h2>Recent audit events</h2>
      {events && events.length === 0 && <p className="staff-sub">None yet.</p>}
      {events && events.length > 0 && (
        <table className="staff-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {[...events].reverse().map((e) => (
              <tr key={e.id}>
                <td>{e.action}</td>
                <td className="staff-sub">
                  {e.entity} {e.entityId}
                </td>
                <td className="staff-sub">{e.actorId ?? 'system'}</td>
                <td>{new Date(e.occurredAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
