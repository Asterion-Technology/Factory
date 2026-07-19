'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AgencyEntry, AuthorizedAgencySummary, ConsumerProfile } from '@stopallcalls/contracts';

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

import TurnstileWidget from './TurnstileWidget';
import AgencyTypeahead from './AgencyTypeahead';

type Step = 'verify' | 'profile' | 'agencies' | 'evidence' | 'review';

interface ClientEvidence {
  id: string;
  category: string;
  originalFilename: string;
  sizeBytes: number;
  scanStatus: string;
}

const EVIDENCE_CATEGORIES = [
  ['COLLECTION_LETTER', 'Collection letter'],
  ['SCREENSHOT', 'Screenshot (text/email/call)'],
  ['CALL_LOG', 'Call log'],
  ['VOICEMAIL', 'Voicemail recording'],
  ['EMAIL_TEXT', 'Email or text message'],
  ['CREDIT_REPORT', 'Credit report'],
] as const;

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
  agencyEmail: '',
  agencyMailingAddress: '',
  originalCreditor: '',
  amountClaimed: '',
  contactChannels: [] as string[],
  // RAD-19: set when the name came from the authorized-registry typeahead;
  // cleared the moment the consumer edits the name manually.
  authorizedAgencyId: '',
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
  const [step, setStep] = useState<Step>('verify');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authForm, setAuthForm] = useState({ email: '', code: '' });
  const [codeSent, setCodeSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // Turnstile tokens are single-use: remount the widget after a failed send.
  const [widgetGeneration, setWidgetGeneration] = useState(0);
  // Present only when the server runs in dev code-exposure mode (no real
  // email provider yet); never set in production configurations.
  const [devCode, setDevCode] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [agencyForm, setAgencyForm] = useState(EMPTY_AGENCY);
  // INT-004 edit: id of the agency loaded into the form, null = adding.
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  // RAD-19: the registry row behind the current form's name, for the
  // "Listed:" confirmation line. Session-local display state only.
  const [selectedAgency, setSelectedAgency] = useState<AuthorizedAgencySummary | null>(null);
  const [evidenceList, setEvidenceList] = useState<ClientEvidence[]>([]);
  const [evidenceCategory, setEvidenceCategory] = useState<string>('COLLECTION_LETTER');
  const [attest, setAttest] = useState({
    isConsumer: false,
    contactConfirmed: false,
    informationTrue: false,
    authorizeLetter: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Creates or resumes the verified consumer's intake and lands the wizard on
  // the furthest step already completed (INT-002 save/resume).
  const bootstrapIntake = useCallback(async (verifiedEmail: string) => {
    const { intake: created } = await api<{ intake: ClientIntake }>('/api/intakes', { method: 'POST' });
    setIntake(created);
    const p = created.profile;
    setProfileForm({
      firstName: p?.firstName ?? '',
      lastName: p?.lastName ?? '',
      dateOfBirth: p?.dateOfBirth ?? '',
      email: p?.email ?? verifiedEmail,
      phone: p?.phone ?? '',
      line1: p?.address?.line1 ?? '',
      city: p?.address?.city ?? '',
      region: p?.address?.region ?? '',
      postalCode: p?.address?.postalCode ?? '',
      country: p?.address?.country ?? 'CA',
      preferredContactMethod: p?.preferredContactMethod ?? 'EMAIL',
    });
    setStep(p && created.agencies.length > 0 ? 'agencies' : 'profile');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { email } = await api<{ email: string | null }>('/api/auth/session');
        if (email) {
          setSessionEmail(email);
          await bootstrapIntake(email);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start your intake.');
      } finally {
        setLoading(false);
      }
    })();
  }, [bootstrapIntake]);

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

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    if (!turnstileToken) return;
    void run(async () => {
      try {
        const { devCode: exposed } = await api<{ sent: boolean; devCode?: string }>('/api/auth/start', {
          method: 'POST',
          body: JSON.stringify({ email: authForm.email, turnstileToken }),
        });
        setDevCode(exposed ?? null);
        setCodeSent(true);
      } catch (err) {
        setTurnstileToken(null);
        setWidgetGeneration((g) => g + 1);
        throw err;
      }
    });
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { email } = await api<{ email: string }>('/api/auth/verify', {
        method: 'POST',
        body: JSON.stringify({ email: authForm.email, code: authForm.code }),
      });
      setSessionEmail(email);
      await bootstrapIntake(email);
    });
  };

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

  const saveAgency = (e: FormEvent) => {
    e.preventDefault();
    if (!intake) return;
    void run(async () => {
      const cents = agencyForm.amountClaimed ? Math.round(Number(agencyForm.amountClaimed) * 100) : null;
      const agency = {
        agencyName: agencyForm.agencyName,
        agencyPhone: agencyForm.agencyPhone || null,
        agencyEmail: agencyForm.agencyEmail || null,
        agencyMailingAddress: agencyForm.agencyMailingAddress || null,
        originalCreditor: agencyForm.originalCreditor || null,
        amountClaimedCents: Number.isFinite(cents) ? cents : null,
        currency: 'CAD',
        contactChannels: agencyForm.contactChannels,
        allegations: [],
        authorizedAgencyId: agencyForm.authorizedAgencyId || null,
      };
      const path = editingAgencyId
        ? `/api/intakes/${intake.id}/agencies/${editingAgencyId}`
        : `/api/intakes/${intake.id}/agencies`;
      const { intake: updated } = await api<{ intake: ClientIntake }>(path, {
        method: editingAgencyId ? 'PATCH' : 'POST',
        body: JSON.stringify({ expectedVersion: intake.version, agency }),
      });
      setIntake(updated);
      setAgencyForm(EMPTY_AGENCY);
      setEditingAgencyId(null);
      setSelectedAgency(null);
    });
  };

  // RAD-19: registry pick — prefill only fields the consumer hasn't already
  // typed (never clobber), and remember the pick for the confirmation line.
  const applyAgencySelection = (a: AuthorizedAgencySummary) => {
    setSelectedAgency(a);
    setAgencyForm((f) => ({
      ...f,
      agencyName: a.name,
      agencyPhone: f.agencyPhone || (a.phone ?? ''),
      agencyEmail: f.agencyEmail || (a.email ?? ''),
      agencyMailingAddress: f.agencyMailingAddress || (a.mailingAddress ?? ''),
      authorizedAgencyId: a.id,
    }));
  };

  const startEditAgency = (agency: StoredAgency) => {
    setEditingAgencyId(agency.id);
    setAgencyForm({
      agencyName: agency.entry.agencyName,
      agencyPhone: agency.entry.agencyPhone ?? '',
      agencyEmail: agency.entry.agencyEmail ?? '',
      agencyMailingAddress: agency.entry.agencyMailingAddress ?? '',
      originalCreditor: agency.entry.originalCreditor ?? '',
      amountClaimed:
        agency.entry.amountClaimedCents != null ? String(agency.entry.amountClaimedCents / 100) : '',
      contactChannels: [...agency.entry.contactChannels],
      authorizedAgencyId: agency.entry.authorizedAgencyId ?? '',
    });
    setSelectedAgency(null);
  };

  const duplicateAgencyItem = (agencyId: string) => {
    if (!intake) return;
    void run(async () => {
      const { intake: updated } = await api<{ intake: ClientIntake }>(
        `/api/intakes/${intake.id}/agencies/${agencyId}/duplicate`,
        { method: 'POST', body: JSON.stringify({ expectedVersion: intake.version }) },
      );
      setIntake(updated);
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

  const refreshEvidence = useCallback(async (intakeId: string) => {
    const { evidence } = await api<{ evidence: ClientEvidence[] }>(`/api/intakes/${intakeId}/evidence`);
    setEvidenceList(evidence);
  }, []);

  useEffect(() => {
    if (step === 'evidence' && intake) {
      refreshEvidence(intake.id).catch(() => setError('Could not load your uploads.'));
    }
  }, [step, intake, refreshEvidence]);

  const uploadEvidence = (file: File) => {
    if (!intake) return;
    void run(async () => {
      const { evidence, upload } = await api<{ evidence: ClientEvidence; upload: { url: string; method: string } }>(
        `/api/intakes/${intake.id}/evidence`,
        {
          method: 'POST',
          body: JSON.stringify({
            category: evidenceCategory,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        },
      );
      const put = await fetch(upload.url, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      try {
        await api(`/api/intakes/${intake.id}/evidence/${evidence.id}/complete`, { method: 'POST' });
      } finally {
        // Refresh even on rejection/infection so the verdict is visible.
        await refreshEvidence(intake.id);
      }
    });
  };

  const removeEvidenceItem = (evidenceId: string) => {
    if (!intake) return;
    void run(async () => {
      await api(`/api/intakes/${intake.id}/evidence/${evidenceId}`, { method: 'DELETE' });
      await refreshEvidence(intake.id);
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
        <a className="cta" href="/status">
          Track your case status
        </a>
      </section>
    );
  }

  return (
    <div>
      <ol className="steps" aria-label="Intake progress">
        {(
          [
            ['verify', 'Verify email'],
            ['profile', 'Your information'],
            ['agencies', 'Collection agencies'],
            ['evidence', 'Proof upload'],
            ['review', 'Review & submit'],
          ] as const
        ).map(([s, label], i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined} className={step === s ? 'active' : ''}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {sessionEmail && step !== 'verify' && <p>Verified as {sessionEmail}</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {step === 'verify' &&
        (codeSent ? (
          <form onSubmit={verifyCode} aria-label="Enter verification code">
            <p>
              We sent a 6-digit code to <strong>{authForm.email}</strong>. Enter it below to continue.
            </p>
            {devCode && (
              <p>
                <strong>Development environment:</strong> email delivery is not configured yet — your
                code is <strong>{devCode}</strong>.
              </p>
            )}
            <label>
              Verification code
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={authForm.code}
                onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
              />
            </label>
            <div className="nav-row">
              <button type="button" className="link" disabled={busy} onClick={() => setCodeSent(false)}>
                ← Use a different email
              </button>
              <button className="cta" type="submit" disabled={busy || authForm.code.length !== 6}>
                Verify and continue
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} aria-label="Verify your email">
            <p>
              Enter your email address and we will send you a one-time code. This lets you save your
              progress and return anytime.
            </p>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={authForm.email}
                onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
              />
            </label>
            <TurnstileWidget key={widgetGeneration} onToken={setTurnstileToken} />
            <button className="cta" type="submit" disabled={busy || !authForm.email || !turnstileToken}>
              Send code
            </button>
          </form>
        ))}

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
                  <span>
                    <button type="button" className="link" disabled={busy} onClick={() => startEditAgency(a)}>
                      Edit
                    </button>{' '}
                    <button type="button" className="link" disabled={busy} onClick={() => duplicateAgencyItem(a.id)}>
                      Duplicate
                    </button>{' '}
                    <button type="button" className="link" disabled={busy} onClick={() => removeAgency(a.id)}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={saveAgency}>
            <div className="grid">
              <label>
                Collection agency name
                <AgencyTypeahead
                  required
                  value={agencyForm.agencyName}
                  region={profileForm.region}
                  country={profileForm.country}
                  disabled={busy}
                  onChange={(name) => {
                    // Manual edits break the registry link — the ref must
                    // always mean "the consumer picked this exact record".
                    setAgencyForm({ ...agencyForm, agencyName: name, authorizedAgencyId: '' });
                    setSelectedAgency(null);
                  }}
                  onSelect={applyAgencySelection}
                />
              </label>
              <label>
                Agency phone (if known)
                <input type="tel" value={agencyForm.agencyPhone} onChange={(e) => setAgencyForm({ ...agencyForm, agencyPhone: e.target.value })} />
              </label>
              <label>
                Agency email (if known)
                <input type="email" value={agencyForm.agencyEmail} onChange={(e) => setAgencyForm({ ...agencyForm, agencyEmail: e.target.value })} />
              </label>
              <label>
                Agency mailing address (if known)
                <input value={agencyForm.agencyMailingAddress} onChange={(e) => setAgencyForm({ ...agencyForm, agencyMailingAddress: e.target.value })} />
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
            {selectedAgency && agencyForm.authorizedAgencyId === selectedAgency.id && (
              <p className="agency-listed" role="status">
                Listed: {selectedAgency.sourceRegistry}
                {selectedAgency.licenceNumber ? `, licence ${selectedAgency.licenceNumber}` : ''} (
                {selectedAgency.licenceStatus})
                {selectedAgency.licenceStatus === 'revoked' || selectedAgency.licenceStatus === 'suspended' ? (
                  <strong> — this licence is {selectedAgency.licenceStatus}. You can still report them.</strong>
                ) : null}
              </p>
            )}
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
              {editingAgencyId ? 'Save changes' : '+ Add this agency'}
            </button>
            {editingAgencyId && (
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => {
                  setEditingAgencyId(null);
                  setAgencyForm(EMPTY_AGENCY);
                  setSelectedAgency(null);
                }}
              >
                Cancel edit
              </button>
            )}
          </form>

          <div className="nav-row">
            <button type="button" className="link" onClick={() => setStep('profile')}>
              ← Back
            </button>
            <button type="button" className="cta" disabled={busy || intake.agencies.length === 0} onClick={() => setStep('evidence')}>
              Continue to proof upload
            </button>
          </div>
        </section>
      )}

      {step === 'evidence' && intake && (
        <section aria-label="Proof upload">
          <p>
            Upload proof of the collection contact — a collection letter, screenshot, call log,
            voicemail, or your credit report. Files are scanned before they are accepted.
            <strong> No proof means no letter can be sent</strong>, but you can continue now and
            add proof later.
          </p>

          {evidenceList.length > 0 && (
            <ul className="agency-list" aria-label="Uploaded files">
              {evidenceList.map((ev) => (
                <li key={ev.id}>
                  <span>
                    <strong>{ev.originalFilename}</strong>{' '}
                    {ev.scanStatus === 'CLEAN'
                      ? '— accepted'
                      : ev.scanStatus === 'INFECTED'
                        ? '— blocked by safety scan'
                        : ev.scanStatus === 'REJECTED'
                          ? '— failed validation'
                          : '— processing'}
                  </span>
                  <button type="button" className="link" disabled={busy} onClick={() => removeEvidenceItem(ev.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid">
            <label>
              What is this file?
              <select value={evidenceCategory} onChange={(e) => setEvidenceCategory(e.target.value)}>
                {EVIDENCE_CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Choose a file (PDF, image, audio, or text)
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.mp3,.wav,.m4a"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) uploadEvidence(file);
                }}
              />
            </label>
          </div>

          <div className="nav-row">
            <button type="button" className="link" onClick={() => setStep('agencies')}>
              ← Back
            </button>
            <button type="button" className="cta" disabled={busy} onClick={() => setStep('review')}>
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
            {intake.agencies.length} collection {intake.agencies.length === 1 ? 'agency' : 'agencies'} ·{' '}
            {evidenceList.filter((ev) => ev.scanStatus === 'CLEAN').length} proof{' '}
            {evidenceList.filter((ev) => ev.scanStatus === 'CLEAN').length === 1 ? 'file' : 'files'}
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
            <button type="button" className="link" onClick={() => setStep('evidence')}>
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
