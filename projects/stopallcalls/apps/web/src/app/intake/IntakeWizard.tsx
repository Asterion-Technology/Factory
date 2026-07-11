'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AgencyEntry, ConsumerProfile } from '@stopallcalls/contracts';

interface StoredAgency {
  id: string;
  entry: AgencyEntry;
}

interface ClientIntake {
  id: string;
  state: string;
  profile: Partial<ConsumerProfile> | null;
  agencies: StoredAgency[];
  version: number;
}

type Step = 'profile' | 'agencies' | 'review';

const EMPTY_PROFILE = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  email: '',
  phone: '',
  line1: '',
  city: '',
  region: '',
  postalCode: '',
  country: 'CA',
  preferredContactMethod: 'EMAIL',
};

const EMPTY_AGENCY = {
  agencyName: '',
  agencyPhone: '',
  originalCreditor: '',
  amountClaimed: '',
  contactChannels: [] as string[],
};

const CHANNELS = ['PHONE', 'TEXT', 'EMAIL', 'LETTER', 'VOICEMAIL', 'CREDIT_REPORT'] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json()) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? 'Request failed. Please try again.');
  return body;
}

export default function IntakeWizard() {
  const [intake, setIntake] = useState<ClientIntake | null>(null);
  const [step, setStep] = useState<Step>('profile');
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [agencyForm, setAgencyForm] = useState(EMPTY_AGENCY);
  const [attest, setAttest] = useState({
    isConsumer: false,
    contactConfirmed: false,
    informationTrue: false,
    authorizeLetter: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { intake: created } = await api<{ intake: ClientIntake }>('/api/intakes', { method: 'POST' });
        setIntake(created);
        const p = created.profile;
        if (p) {
          setProfileForm({
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            dateOfBirth: p.dateOfBirth ?? '',
            email: p.email ?? '',
            phone: p.phone ?? '',
            line1: p.address?.line1 ?? '',
            city: p.address?.city ?? '',
            region: p.address?.region ?? '',
            postalCode: p.address?.postalCode ?? '',
            country: p.address?.country ?? 'CA',
            preferredContactMethod: p.preferredContactMethod ?? 'EMAIL',
          });
          if (created.agencies.length > 0) setStep('agencies');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start your intake.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, []);

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    if (!intake) return;
    void run(async () => {
      const profile: ConsumerProfile = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        dateOfBirth: profileForm.dateOfBirth,
        email: profileForm.email,
        phone: profileForm.phone,
        address: {
          line1: profileForm.line1,
          city: profileForm.city,
          region: profileForm.region,
          postalCode: profileForm.postalCode,
          country: profileForm.country,
        },
        preferredContactMethod: profileForm.preferredContactMethod as ConsumerProfile['preferredContactMethod'],
      };
      const { intake: updated } = await api<{ intake: ClientIntake }>(`/api/intakes/${intake.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: intake.version, profile }),
      });
      setIntake(updated);
      setStep('agencies');
    });
  };

  const addAgency = (e: FormEvent) => {
    e.preventDefault();
    if (!intake) return;
    void run(async () => {
      const cents = agencyForm.amountClaimed ? Math.round(Number(agencyForm.amountClaimed) * 100) : null;
      const agency = {
        agencyName: agencyForm.agencyName,
        agencyPhone: agencyForm.agencyPhone || null,
        originalCreditor: agencyForm.originalCreditor || null,
        amountClaimedCents: Number.isFinite(cents) ? cents : null,
        currency: 'CAD',
        contactChannels: agencyForm.contactChannels,
        allegations: [],
      };
      const { intake: updated } = await api<{ intake: ClientIntake }>(`/api/intakes/${intake.id}/agencies`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: intake.version, agency }),
      });
      setIntake(updated);
      setAgencyForm(EMPTY_AGENCY);
    });
  };

  const removeAgency = (agencyId: string) => {
    if (!intake) return;
    void run(async () => {
      const { intake: updated } = await api<{ intake: ClientIntake }>(
        `/api/intakes/${intake.id}/agencies/${agencyId}`,
        { method: 'DELETE', body: JSON.stringify({ expectedVersion: intake.version }) },
      );
      setIntake(updated);
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!intake) return;
    void run(async () => {
      const { intake: updated } = await api<{ intake: ClientIntake }>(`/api/intakes/${intake.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: intake.version, attestations: attest }),
      });
      setIntake(updated);
    });
  };

  if (loading) return <p role="status">Loading your intake…</p>;

  if (intake && intake.state !== 'DRAFT') {
    return (
      <section aria-live="polite">
        <h2>Intake received</h2>
        <p>
          Thank you. Your intake has been submitted with {intake.agencies.length} collection{' '}
          {intake.agencies.length === 1 ? 'agency' : 'agencies'}. Our team will review your
          information and contact you at the email address you provided. Reference:{' '}
          <strong>{intake.id.slice(0, 8).toUpperCase()}</strong>
        </p>
      </section>
    );
  }

  return (
    <div>
      <ol className="steps" aria-label="Intake progress">
        {(['profile', 'agencies', 'review'] as const).map((s, i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined} className={step === s ? 'active' : ''}>
            {i + 1}. {s === 'profile' ? 'Your information' : s === 'agencies' ? 'Collection agencies' : 'Review & submit'}
          </li>
        ))}
      </ol>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {step === 'profile' && (
        <form onSubmit={saveProfile} aria-label="Your information">
          <div className="grid">
            <label>
              First name
              <input required value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} />
            </label>
            <label>
              Last name
              <input required value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} />
            </label>
            <label>
              Date of birth
              <input required type="date" value={profileForm.dateOfBirth} onChange={(e) => setProfileForm({ ...profileForm, dateOfBirth: e.target.value })} />
            </label>
            <label>
              Email
              <input required type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
            </label>
            <label>
              Mobile phone
              <input required type="tel" minLength={7} value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
            </label>
            <label>
              Street address
              <input required value={profileForm.line1} onChange={(e) => setProfileForm({ ...profileForm, line1: e.target.value })} />
            </label>
            <label>
              City
              <input required value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} />
            </label>
            <label>
              Province / State
              <input required value={profileForm.region} onChange={(e) => setProfileForm({ ...profileForm, region: e.target.value })} />
            </label>
            <label>
              Postal / ZIP code
              <input required value={profileForm.postalCode} onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })} />
            </label>
            <label>
              Country
              <select value={profileForm.country} onChange={(e) => setProfileForm({ ...profileForm, country: e.target.value })}>
                <option value="CA">Canada</option>
                <option value="US">United States</option>
              </select>
            </label>
            <label>
              Preferred contact method
              <select value={profileForm.preferredContactMethod} onChange={(e) => setProfileForm({ ...profileForm, preferredContactMethod: e.target.value })}>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="TEXT">Text</option>
                <option value="MAIL">Mail</option>
              </select>
            </label>
          </div>
          <button className="cta" type="submit" disabled={busy}>
            Save and continue
          </button>
        </form>
      )}

      {step === 'agencies' && intake && (
        <section aria-label="Collection agencies">
          {intake.agencies.length > 0 && (
            <ul className="agency-list">
              {intake.agencies.map((a) => (
                <li key={a.id}>
                  <span>
                    <strong>{a.entry.agencyName}</strong>
                    {a.entry.originalCreditor ? ` — originally ${a.entry.originalCreditor}` : ''}
                  </span>
                  <button type="button" className="link" disabled={busy} onClick={() => removeAgency(a.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addAgency}>
            <div className="grid">
              <label>
                Collection agency name
                <input required value={agencyForm.agencyName} onChange={(e) => setAgencyForm({ ...agencyForm, agencyName: e.target.value })} />
              </label>
              <label>
                Agency phone (if known)
                <input type="tel" value={agencyForm.agencyPhone} onChange={(e) => setAgencyForm({ ...agencyForm, agencyPhone: e.target.value })} />
              </label>
              <label>
                Original creditor (if known)
                <input value={agencyForm.originalCreditor} onChange={(e) => setAgencyForm({ ...agencyForm, originalCreditor: e.target.value })} />
              </label>
              <label>
                Amount claimed (CAD, if known)
                <input type="number" min="0" step="0.01" value={agencyForm.amountClaimed} onChange={(e) => setAgencyForm({ ...agencyForm, amountClaimed: e.target.value })} />
              </label>
            </div>
            <fieldset>
              <legend>How did they contact you? (select all that apply)</legend>
              {CHANNELS.map((c) => (
                <label key={c} className="check">
                  <input
                    type="checkbox"
                    checked={agencyForm.contactChannels.includes(c)}
                    onChange={(e) =>
                      setAgencyForm({
                        ...agencyForm,
                        contactChannels: e.target.checked
                          ? [...agencyForm.contactChannels, c]
                          : agencyForm.contactChannels.filter((x) => x !== c),
                      })
                    }
                  />
                  {c === 'CREDIT_REPORT' ? 'Credit report' : c.charAt(0) + c.slice(1).toLowerCase()}
                </label>
              ))}
            </fieldset>
            <button className="cta secondary" type="submit" disabled={busy || agencyForm.contactChannels.length === 0}>
              + Add this agency
            </button>
          </form>

          <div className="nav-row">
            <button type="button" className="link" onClick={() => setStep('profile')}>
              ← Back
            </button>
            <button type="button" className="cta" disabled={busy || intake.agencies.length === 0} onClick={() => setStep('review')}>
              Continue to review
            </button>
          </div>
        </section>
      )}

      {step === 'review' && intake && (
        <form onSubmit={submit} aria-label="Review and submit">
          <h2>Review</h2>
          <p>
            {profileForm.firstName} {profileForm.lastName} · {profileForm.email} ·{' '}
            {intake.agencies.length} collection {intake.agencies.length === 1 ? 'agency' : 'agencies'}
          </p>
          <fieldset>
            <legend>Attestation</legend>
            {(
              [
                ['isConsumer', 'I confirm I am the consumer.'],
                ['contactConfirmed', 'I confirm I am being contacted by the listed collection agency or agencies.'],
                ['informationTrue', 'I confirm the information I provided is true.'],
                ['authorizeLetter', 'I authorize the firm to send a limited-scope cease-and-desist / communication letter.'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  required
                  checked={attest[key]}
                  onChange={(e) => setAttest({ ...attest, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="nav-row">
            <button type="button" className="link" onClick={() => setStep('agencies')}>
              ← Back
            </button>
            <button className="cta" type="submit" disabled={busy || !Object.values(attest).every(Boolean)}>
              Submit intake
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
