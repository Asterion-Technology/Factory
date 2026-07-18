'use client';

import { useEffect, useState } from 'react';

interface OpsResponse {
  available: boolean;
  reason?: string;
  metrics?: Record<string, unknown>;
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
      {ops.available && ops.metrics && (
        <dl className="staff-dl">
          {Object.entries(ops.metrics).map(([k, v]) => (
            <div key={k} className="staff-metric">
              <dt>{k}</dt>
              <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
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
