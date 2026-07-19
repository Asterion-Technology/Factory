'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Profile {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: { line1: string; line2?: string | null; city: string; region: string; postalCode: string; country: string };
  preferredContactMethod?: string;
}

interface Agency {
  id: string;
  entry: {
    agencyName: string;
    agencyPhone?: string | null;
    agencyEmail?: string | null;
    accountNumberLast4?: string | null;
    amountClaimedCents?: number | null;
    currency?: string;
    contactFrequency?: string | null;
    stillContacting?: boolean | null;
  };
}

interface IntakeDetail {
  id: string;
  jurisdiction: string;
  state: string;
  profile: Profile | null;
  agencies: Agency[];
  submittedSnapshot: { submittedAt: string; profile: Profile; agencies: Agency[] } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Mirrors ConflictCheckRecord (packages/db/src/clio.ts) — the API returns the
// record as-is: hits per search term, disposition fields flat and null until
// an authorized human decides (CLIO-003).
interface ConflictCheck {
  id: string;
  terms: unknown[];
  hits: { contacts: unknown[] }[];
  disposition: string | null;
  reviewedBy: string | null;
  rationale: string | null;
}

interface MatterSummary {
  id: string;
  agencyId: string;
  displayNumber: string;
  state: string;
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

// UI-003/UI-004 master client view: identity, gate state, agency list — the
// submitted snapshot wins over the live draft, mirroring what gates act on —
// plus the conflict workspace and per-agency matter links.
export default function StaffIntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [intake, setIntake] = useState<IntakeDetail | null>(null);
  const [conflict, setConflict] = useState<ConflictCheck | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [me, setMe] = useState('');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSide = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      api<{ check: ConflictCheck }>(`/api/staff/intakes/${id}/conflict`)
        .then((b) => setConflict(b.check))
        .catch(() => setConflict(null)),
      api<{ matters: MatterSummary[] }>(`/api/staff/intakes/${id}/matters`)
        .then((b) => setMatters(b.matters))
        .catch(() => setMatters([])),
    ]);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/staff/intakes/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { intake: IntakeDetail };
        setIntake(body.intake);
      })
      .catch(() => setError('Could not load this intake.'));
    void loadSide();
    void api<{ staff: { email: string } }>('/api/staff/me').then((b) => setMe(b.staff.email)).catch(() => {});
  }, [id, loadSide]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await loadSide();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [loadSide],
  );

  if (error) return <p className="error">{error}</p>;
  if (!intake) return <p>Loading…</p>;

  const profile = intake.submittedSnapshot?.profile ?? intake.profile;
  const agencies = intake.submittedSnapshot?.agencies ?? intake.agencies;
  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '(no profile yet)';

  return (
    <section>
      <p>
        <Link className="link" href="/staff">
          ← Queue
        </Link>
      </p>
      <h1>{name}</h1>
      <p>
        <span className="staff-tag">{intake.state.replaceAll('_', ' ').toLowerCase()}</span>{' '}
        <span className="staff-sub">
          intake {intake.id} · {intake.jurisdiction} · created {new Date(intake.createdAt).toLocaleString()}
          {intake.submittedSnapshot ? ` · submitted ${new Date(intake.submittedSnapshot.submittedAt).toLocaleString()}` : ' · not yet submitted'}
        </span>
      </p>

      <h2>Contact</h2>
      {profile ? (
        <dl className="staff-dl">
          <dt>Email</dt>
          <dd>{profile.email ?? '—'}</dd>
          <dt>Phone</dt>
          <dd>{profile.phone ?? '—'}</dd>
          <dt>Address</dt>
          <dd>
            {profile.address
              ? [profile.address.line1, profile.address.line2, profile.address.city, profile.address.region, profile.address.postalCode, profile.address.country]
                  .filter(Boolean)
                  .join(', ')
              : '—'}
          </dd>
          <dt>Preferred contact</dt>
          <dd>{profile.preferredContactMethod ?? '—'}</dd>
        </dl>
      ) : (
        <p className="staff-sub">No profile captured yet.</p>
      )}

      <h2>Collection agencies ({agencies.length})</h2>
      {agencies.length === 0 && <p className="staff-sub">None added yet.</p>}
      <ul className="agency-list">
        {agencies.map((a) => (
          <li key={a.id}>
            <strong>{a.entry.agencyName}</strong>
            <div className="staff-sub">
              {[
                a.entry.agencyPhone,
                a.entry.agencyEmail,
                a.entry.accountNumberLast4 && `acct …${a.entry.accountNumberLast4}`,
                a.entry.amountClaimedCents != null &&
                  `${((a.entry.amountClaimedCents ?? 0) / 100).toFixed(2)} ${a.entry.currency ?? 'CAD'} claimed`,
              ]
                .filter(Boolean)
                .join(' · ') || 'no contact details'}
            </div>
            {(a.entry.contactFrequency || a.entry.stillContacting != null) && (
              <div className="staff-sub">
                {[a.entry.contactFrequency, a.entry.stillContacting != null ? (a.entry.stillContacting ? 'still contacting' : 'contact stopped') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2>Conflict check (CLIO-002/003)</h2>
      {actionError && <p className="error">{actionError}</p>}
      {!conflict && (
        <button
          className="cta"
          disabled={busy}
          onClick={() => act(() => api(`/api/staff/intakes/${id}/conflict`, { method: 'POST' }))}
        >
          Run conflict check
        </button>
      )}
      {conflict && (
        <>
          <p>
            <span className="staff-tag">{(conflict.disposition ?? 'UNDECIDED').replaceAll('_', ' ').toLowerCase()}</span>{' '}
            <span className="staff-sub">
              {conflict.hits.reduce((n, h) => n + h.contacts.length, 0)} Clio result(s) across {conflict.terms.length}{' '}
              search term(s)
            </span>
          </p>
          {conflict.disposition ? (
            <p className="staff-sub">
              Disposition: <strong>{conflict.disposition}</strong> by {conflict.reviewedBy} — {conflict.rationale}
            </p>
          ) : (
            <>
              <textarea
                className="staff-search"
                placeholder="Rationale (required — recorded in the audit trail)"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
              <div className="staff-filters">
                {(['CLEAR', 'POSSIBLE_CONFLICT', 'CONFLICT_FOUND'] as const).map((d) => (
                  <button
                    key={d}
                    className={d === 'CLEAR' ? 'cta' : 'cta secondary'}
                    disabled={busy || !me || !rationale.trim()}
                    onClick={() =>
                      act(() =>
                        api(`/api/staff/intakes/${id}/conflict/disposition`, {
                          method: 'POST',
                          body: JSON.stringify({ disposition: d, reviewedBy: me, rationale: rationale.trim() }),
                        }),
                      )
                    }
                  >
                    {d.replaceAll('_', ' ').toLowerCase()}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <h2>Matters ({matters.length})</h2>
      {matters.length === 0 && (
        <p>
          <span className="staff-sub">None provisioned yet. </span>
          <button
            className="cta secondary"
            disabled={busy}
            onClick={() => act(() => api(`/api/staff/intakes/${id}/provision`, { method: 'POST' }))}
          >
            Provision matters
          </button>
        </p>
      )}
      {matters.length > 0 && (
        <ul className="agency-list">
          {matters.map((m) => (
            <li key={m.id}>
              <Link className="link" href={`/staff/matters/${m.id}`}>
                {m.displayNumber}
              </Link>{' '}
              <span className="staff-tag">{m.state.replaceAll('_', ' ').toLowerCase()}</span>
              <div className="staff-sub">updated {new Date(m.updatedAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
