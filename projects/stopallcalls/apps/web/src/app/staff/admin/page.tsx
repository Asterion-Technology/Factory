'use client';

import { useCallback, useEffect, useState } from 'react';

interface Market {
  code: string;
  status: 'active' | 'dormant';
  regions: string[];
  updatedBy: string;
  updatedAt: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Request failed (${res.status})`);
  return body;
}

// UI-005/006: market administration. A status flip is high-impact, so the
// confirm step requires typing the market code (UI-006); the server is the
// real gate — ADMIN role + audit event with before/after (staff/markets PUT).
export default function StaffAdminPage() {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [confirming, setConfirming] = useState<Market | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await api<{ markets: Market[] }>('/api/staff/markets');
      setMarkets(b.markets);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flip = useCallback(async () => {
    if (!confirming || typed !== confirming.code) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = confirming.status === 'active' ? 'dormant' : 'active';
      await api(`/api/staff/markets/${confirming.code}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      setNote(`${confirming.code} is now ${next} — change recorded in the audit trail.`);
      setConfirming(null);
      setTyped('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [confirming, typed, load]);

  if (error && !markets) return <p className="error">{error}</p>;
  if (!markets) return <p>Loading…</p>;

  return (
    <section>
      <h1>Administration</h1>
      <h2>Markets</h2>
      <p className="staff-sub">
        Intake opens only in an <strong>active</strong> market for an allowlisted region. Flips never affect existing
        cases; every change is audited. Only administrators can change this.
      </p>
      {note && <p className="staff-tag">{note}</p>}
      {error && <p className="error">{error}</p>}
      <table className="staff-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Status</th>
            <th>Open regions</th>
            <th>Last change</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m) => (
            <tr key={m.code}>
              <td>
                <strong>{m.code}</strong>
              </td>
              <td>
                <span className="staff-tag">{m.status}</span>
              </td>
              <td className="staff-sub">{m.regions.length ? m.regions.join(', ') : '(none configured)'}</td>
              <td className="staff-sub">
                {m.updatedBy} · {new Date(m.updatedAt).toLocaleString()}
              </td>
              <td>
                <button className="cta secondary" disabled={busy} onClick={() => { setConfirming(m); setTyped(''); }}>
                  {m.status === 'active' ? 'Make dormant' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {confirming && (
        <div className="staff-confirm">
          <p>
            <strong>
              {confirming.status === 'active' ? 'Close' : 'Open'} the {confirming.code} market
              {confirming.status === 'active' ? ' to new intakes?' : ' for new intakes?'}
            </strong>{' '}
            <span className="staff-sub">Type {confirming.code} to confirm — this is recorded with your identity.</span>
          </p>
          <input className="staff-search" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
          <div className="staff-filters">
            <button className="cta" disabled={busy || typed !== confirming.code} onClick={() => void flip()}>
              Confirm
            </button>
            <button className="cta secondary" disabled={busy} onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
