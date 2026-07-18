'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface LetterVersion {
  id: string;
  templateId: string;
  templateVersion: number;
  sourceSnapshot: { fields: Record<string, string>; renderedContent: string };
  contentHash: string;
  status: string;
  author: string;
  createdAt: string;
}

interface Approval {
  id: string;
  decision: string;
  decidedBy: string;
  reason?: string | null;
  contentHash: string;
  decidedAt: string;
}

interface ReviewPayload {
  matterState: string;
  current: LetterVersion | null;
  priorContent: string | null;
  approvals: Approval[];
  gates: Record<string, boolean | string>;
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

// UI-004 matter workspace: the lawyer letter pipeline. The approve/reject
// form submits the exact contentHash of the version on screen — the server
// re-verifies it (WF-005), so a draft regenerated mid-review is rejected
// rather than silently approved.
export default function StaffMatterPage() {
  const { matterId } = useParams<{ matterId: string }>();
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [me, setMe] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState('');
  const [showPrior, setShowPrior] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const payload = await api<ReviewPayload>(`/api/staff/matters/${matterId}/letter`);
      setReview(payload);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [matterId]);

  useEffect(() => {
    if (!matterId) return;
    void load();
    void api<{ staff: { email: string } }>('/api/staff/me').then((b) => setMe(b.staff.email)).catch(() => {});
  }, [matterId, load]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, done: string) => {
      setBusy(true);
      setNote(null);
      setError(null);
      try {
        await fn();
        setNote(done);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (error && !review) return <p className="error">{error}</p>;
  if (!review) return <p>Loading…</p>;

  const current = review.current;

  return (
    <section>
      <p>
        <Link className="link" href="/staff">
          ← Queue
        </Link>
      </p>
      <h1>Matter workspace</h1>
      <p>
        <span className="staff-tag">{review.matterState.replaceAll('_', ' ').toLowerCase()}</span>{' '}
        <span className="staff-sub">matter {matterId}</span>
      </p>

      <h2>Gates</h2>
      <dl className="staff-dl">
        {Object.entries(review.gates).map(([k, v]) => (
          <div key={k} className="staff-metric">
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>

      {note && <p className="staff-tag">{note}</p>}
      {error && <p className="error">{error}</p>}

      <h2>Letter</h2>
      {!current && (
        <button
          className="cta"
          disabled={busy || !me}
          onClick={() =>
            act(
              () => api(`/api/staff/matters/${matterId}/letter`, { method: 'POST', body: JSON.stringify({ author: me }) }),
              'Draft generated.',
            )
          }
        >
          Generate draft
        </button>
      )}
      {current && (
        <>
          <p className="staff-sub">
            v{current.templateVersion} · {current.status} · by {current.author} ·{' '}
            {new Date(current.createdAt).toLocaleString()} · hash {current.contentHash.slice(0, 12)}…
          </p>
          <pre className="staff-letter">{current.sourceSnapshot.renderedContent}</pre>
          {review.priorContent && (
            <p>
              <button className="cta secondary" onClick={() => setShowPrior((s) => !s)}>
                {showPrior ? 'Hide' : 'Show'} prior version
              </button>
            </p>
          )}
          {showPrior && review.priorContent && <pre className="staff-letter staff-prior">{review.priorContent}</pre>}

          <h3>Approvals</h3>
          {review.approvals.length === 0 && <p className="staff-sub">None recorded for this version.</p>}
          <ul>
            {review.approvals.map((a) => (
              <li key={a.id} className="staff-sub">
                {a.decision} by {a.decidedBy} at {new Date(a.decidedAt).toLocaleString()}
                {a.reason ? ` — ${a.reason}` : ''}
              </li>
            ))}
          </ul>

          <h3>Decision (lawyer)</h3>
          <textarea
            className="staff-search"
            placeholder="Reason (required for rejection)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="staff-filters">
            <button
              className="cta"
              disabled={busy || !me}
              onClick={() =>
                act(
                  () =>
                    api(`/api/staff/matters/${matterId}/letter/decision`, {
                      method: 'POST',
                      body: JSON.stringify({
                        letterVersionId: current.id,
                        contentHash: current.contentHash,
                        decision: 'APPROVED',
                        decidedBy: me,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      }),
                    }),
                  'Approval recorded — bound to the content hash on screen.',
                )
              }
            >
              Approve this exact version
            </button>
            <button
              className="cta secondary"
              disabled={busy || !me || !reason.trim()}
              onClick={() =>
                act(
                  () =>
                    api(`/api/staff/matters/${matterId}/letter/decision`, {
                      method: 'POST',
                      body: JSON.stringify({
                        letterVersionId: current.id,
                        contentHash: current.contentHash,
                        decision: 'REJECTED',
                        decidedBy: me,
                        reason: reason.trim(),
                      }),
                    }),
                  'Rejection recorded.',
                )
              }
            >
              Reject
            </button>
          </div>

          <h3>Send</h3>
          <input
            className="staff-search"
            placeholder="Recipient email (collection agency)"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
          <button
            className="cta"
            disabled={busy || !recipient.trim()}
            onClick={() =>
              act(
                () =>
                  api(`/api/staff/matters/${matterId}/letter/send`, {
                    method: 'POST',
                    body: JSON.stringify({ letterVersionId: current.id, recipient: recipient.trim() }),
                  }),
                'Send accepted — delivery is exactly-once per version.',
              )
            }
          >
            Send approved letter
          </button>
        </>
      )}
    </section>
  );
}
