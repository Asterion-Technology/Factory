'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface IntakeSummary {
  id: string;
  state: string;
  jurisdiction: string;
  name: string | null;
  email: string | null;
  agencyCount: number;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// The gate-relevant queue buckets, in workflow order (UI-002). "All" shows
// everything the store returns, newest activity first.
const QUEUE_FILTERS = [
  'ALL',
  'SUBMITTED',
  'EVIDENCE_REVIEW',
  'CONFLICT_REVIEW',
  'IDENTITY_REVIEW',
  'RETAINER_PENDING',
  'PAYMENT_PENDING',
  'READY_TO_OPEN',
  'MANUAL_REVIEW',
  'NEEDS_INFORMATION',
] as const;

export default function StaffQueuePage() {
  const [filter, setFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [intakes, setIntakes] = useState<IntakeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (filter !== 'ALL') params.set('state', filter);
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/staff/intakes?${params}`);
    if (!res.ok) {
      setError('Could not load the queue.');
      return;
    }
    const body = (await res.json()) as { intakes: IntakeSummary[] };
    setIntakes(body.intakes);
  }, [filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <h1>Intake queue</h1>
      <div className="staff-filters">
        {QUEUE_FILTERS.map((s) => (
          <button
            key={s}
            className={`cta secondary${filter === s ? ' staff-filter-active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s.replaceAll('_', ' ').toLowerCase()}
          </button>
        ))}
      </div>
      <input
        className="staff-search"
        placeholder="Filter by name, email, or intake id"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      {intakes === null && !error && <p>Loading…</p>}
      {intakes !== null && intakes.length === 0 && <p>No intakes match.</p>}
      {intakes !== null && intakes.length > 0 && (
        <table className="staff-table">
          <thead>
            <tr>
              <th>Consumer</th>
              <th>State</th>
              <th>Agencies</th>
              <th>Jurisdiction</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {intakes.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link className="link" href={`/staff/intakes/${i.id}`}>
                    {i.name ?? '(no profile yet)'}
                  </Link>
                  <div className="staff-sub">{i.email ?? i.id}</div>
                </td>
                <td>
                  <span className="staff-tag">{i.state.replaceAll('_', ' ').toLowerCase()}</span>
                </td>
                <td>{i.agencyCount}</td>
                <td>{i.jurisdiction}</td>
                <td>{new Date(i.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
