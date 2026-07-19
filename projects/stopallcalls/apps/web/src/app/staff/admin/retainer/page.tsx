'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface RetainerVersion {
  id: string;
  jurisdiction: string;
  language: string;
  effectiveDate: string;
  contentHash: string;
  storageKey: string;
  publishedAt: string;
}

interface UploadedDoc {
  contentHash: string;
  storageKey: string;
  sizeBytes: number;
  filename: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? `Request failed (${res.status})`);
  return body;
}

const today = (): string => new Date().toISOString().slice(0, 10);

// RAD-27 (RET-001/004): upload → server-computed hash → type-to-confirm
// publish. Publishing is high-impact legal content (it supersedes the active
// version and invalidates pending signatures), so like the market flip it
// requires typing the jurisdiction code before the button arms. Versions are
// immutable — corrections are a new upload + publish.
export default function RetainerAdminPage() {
  const [versions, setVersions] = useState<RetainerVersion[] | null>(null);
  const [jurisdiction, setJurisdiction] = useState('CA');
  const [language, setLanguage] = useState('en');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [uploaded, setUploaded] = useState<UploadedDoc | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const b = await api<{ versions: RetainerVersion[] }>('/api/staff/retainer/versions');
      setVersions(b.versions);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNote(null);
    setUploaded(null);
    try {
      const b = await api<Omit<UploadedDoc, 'filename'>>(
        `/api/staff/retainer/document?jurisdiction=${encodeURIComponent(jurisdiction.trim())}`,
        { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file },
      );
      setUploaded({ ...b, filename: file.name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!uploaded || typed.trim().toUpperCase() !== jurisdiction.trim().toUpperCase()) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/staff/retainer/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jurisdiction: jurisdiction.trim().toUpperCase(),
          language: language.trim() || 'en',
          effectiveDate,
          contentHash: uploaded.contentHash,
          storageKey: uploaded.storageKey,
        }),
      });
      setNote(
        `Published for ${jurisdiction.trim().toUpperCase()} — now the active version. ` +
          'Any signature requests pending on the previous version are superseded.',
      );
      setUploaded(null);
      setTyped('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Latest published per jurisdiction is the active one (matches getActive).
  const activeIds = new Set(
    Object.values(
      (versions ?? []).reduce<Record<string, RetainerVersion>>((acc, v) => {
        if (!acc[v.jurisdiction] || acc[v.jurisdiction]!.publishedAt < v.publishedAt) acc[v.jurisdiction] = v;
        return acc;
      }, {}),
    ).map((v) => v.id),
  );

  if (error && !versions) return <p className="error">{error}</p>;
  if (!versions) return <p>Loading…</p>;

  return (
    <section>
      <p>
        <Link className="link" href="/staff/admin">
          ← Admin
        </Link>
      </p>
      <h1>Retainer versions</h1>
      <p className="staff-sub">
        Consumers sign the latest published version for their jurisdiction. Versions are immutable and
        hash-bound — publishing supersedes the active version and invalidates signature requests still
        pending on it. Content must be counsel-approved before it is published here.
      </p>

      {note && <p className="staff-note">{note}</p>}
      {error && <p className="error">{error}</p>}

      <h2>Publish a new version</h2>
      <div className="retainer-form">
        <label>
          Jurisdiction
          <input value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} maxLength={8} />
        </label>
        <label>
          Language
          <input value={language} onChange={(e) => setLanguage(e.target.value)} maxLength={8} />
        </label>
        <label>
          Effective date
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </label>
        <label>
          Retainer document (PDF)
          <input
            type="file"
            accept="application/pdf"
            disabled={busy || jurisdiction.trim().length < 2}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {uploaded && (
        <div className="staff-confirm">
          <p>
            <strong>{uploaded.filename}</strong> · {(uploaded.sizeBytes / 1024).toFixed(1)} KB uploaded.
          </p>
          <p className="staff-sub">
            SHA-256 <code>{uploaded.contentHash}</code>
            <br />
            stored at <code>{uploaded.storageKey}</code>
          </p>
          <p>
            Publishing makes this the retainer every {jurisdiction.trim().toUpperCase()} consumer signs.
            Type <strong>{jurisdiction.trim().toUpperCase()}</strong> to confirm:
          </p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type the jurisdiction to confirm" />{' '}
          <button
            className="cta"
            disabled={busy || typed.trim().toUpperCase() !== jurisdiction.trim().toUpperCase()}
            onClick={() => void publish()}
          >
            Publish version
          </button>{' '}
          <button type="button" className="link" disabled={busy} onClick={() => setUploaded(null)}>
            Discard upload
          </button>
        </div>
      )}

      <h2>History</h2>
      {versions.length === 0 && <p className="staff-sub">No versions published yet — consumers cannot reach Review &amp; sign until one exists.</p>}
      {versions.length > 0 && (
        <table className="staff-table">
          <thead>
            <tr>
              <th>Jurisdiction</th>
              <th>Language</th>
              <th>Effective</th>
              <th>Published</th>
              <th>Content hash</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className={activeIds.has(v.id) ? undefined : 'staff-prior'}>
                <td>{v.jurisdiction}</td>
                <td>{v.language}</td>
                <td>{v.effectiveDate}</td>
                <td>{new Date(v.publishedAt).toLocaleString()}</td>
                <td className="staff-sub">
                  <code>{v.contentHash.slice(0, 12)}…</code>
                </td>
                <td>{activeIds.has(v.id) && <span className="staff-tag">active</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
