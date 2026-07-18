'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

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

// UI-003 master client view, v1: identity, gate state, and the agency list —
// the submitted snapshot wins over the live draft, mirroring what gates act
// on. Matter workspaces (UI-004) hang off this page in the next slice.
export default function StaffIntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [intake, setIntake] = useState<IntakeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/staff/intakes/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { intake: IntakeDetail };
        setIntake(body.intake);
      })
      .catch(() => setError('Could not load this intake.'));
  }, [id]);

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
    </section>
  );
}
