'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface CaseStatus {
  submitted: boolean;
  submittedAt: string | null;
  agencyCount: number;
  evidence: { total: number; clean: number };
  identity: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'UNDER_REVIEW';
  retainerSigned: boolean;
  payment: 'NOT_STARTED' | 'STARTED' | 'AWAITING_EMT' | 'SETTLED';
  totalCents: number | null;
  currency: string | null;
  letter: 'NONE' | 'PREPARING' | 'SENT' | 'DELIVERED';
}

type StepState = 'complete' | 'active' | 'pending' | 'attention';

interface StepView {
  key: string;
  title: string;
  detail: string;
  state: StepState;
  action?: { label: string; run: () => Promise<void> };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json()) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(body.error?.message ?? 'Request failed. Please try again.');
  return body;
}

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

export default function StatusTracker() {
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [status, setStatus] = useState<CaseStatus | null>(null);
  const [emtInstructions, setEmtInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  const refresh = useCallback(async (id: string) => {
    const { status: next } = await api<{ status: CaseStatus }>(`/api/intakes/${id}/status`);
    setStatus(next);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { intake } = await api<{ intake: { id: string } | null }>('/api/intakes');
        if (!intake) {
          setNeedsVerification(true);
          return;
        }
        setIntakeId(intake.id);
        await refresh(intake.id);
      } catch {
        setNeedsVerification(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const act = useCallback(
    async (run: () => Promise<void>) => {
      if (!intakeId) return;
      setBusy(true);
      setError(null);
      try {
        await run();
        await refresh(intakeId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [intakeId, refresh],
  );

  if (loading) return <p aria-live="polite">Loading your case…</p>;
  if (needsVerification || !intakeId) {
    return (
      <p>
        Verify your email to see your case. <Link className="cta secondary" href="/intake">Go to intake</Link>
      </p>
    );
  }
  if (!status) return <p aria-live="polite">Loading your case…</p>;

  if (!status.submitted) {
    return (
      <p>
        Your intake has not been submitted yet.{' '}
        <Link className="cta secondary" href="/intake">Continue your intake</Link>
      </p>
    );
  }

  const startIdentity = () =>
    act(async () => {
      const { sessionUrl } = await api<{ sessionUrl: string }>(`/api/intakes/${intakeId}/identity`, { method: 'POST' });
      window.open(sessionUrl, '_blank', 'noopener');
    });

  const startRetainer = () =>
    act(async () => {
      const { signingUrl } = await api<{ signingUrl: string }>(`/api/intakes/${intakeId}/retainer`, { method: 'POST' });
      window.open(signingUrl, '_blank', 'noopener');
    });

  const confirmRetainer = () =>
    act(async () => {
      await api(`/api/intakes/${intakeId}/retainer`, { method: 'PUT' });
    });

  const startCardPayment = () =>
    act(async () => {
      const { redirectUrl } = await api<{ redirectUrl: string }>(`/api/intakes/${intakeId}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ method: 'CARD' }),
      });
      window.open(redirectUrl, '_blank', 'noopener');
    });

  const startEmt = () =>
    act(async () => {
      const { emtInstructions: instructions } = await api<{ emtInstructions: string }>(
        `/api/intakes/${intakeId}/checkout`,
        { method: 'POST', body: JSON.stringify({ method: 'EMT' }) },
      );
      setEmtInstructions(instructions);
    });

  const evidenceDone = status.evidence.total > 0 && status.evidence.clean === status.evidence.total;
  const steps: StepView[] = [
    {
      key: 'submitted',
      title: 'Application submitted',
      detail: `${status.agencyCount} collection ${status.agencyCount === 1 ? 'agency' : 'agencies'} reported.`,
      state: 'complete',
    },
    {
      key: 'evidence',
      title: 'Evidence check',
      detail: evidenceDone
        ? `${status.evidence.clean} file${status.evidence.clean === 1 ? '' : 's'} received and scanned.`
        : 'Your uploaded files are being processed.',
      state: evidenceDone ? 'complete' : 'active',
    },
    {
      key: 'review',
      title: 'Case review',
      detail:
        status.letter === 'NONE'
          ? 'Our team reviews every case before a letter is prepared.'
          : 'Review complete.',
      state: status.letter === 'NONE' ? 'active' : 'complete',
    },
    {
      key: 'identity',
      title: 'Identity verification',
      detail:
        status.identity === 'VERIFIED'
          ? 'Your identity is verified.'
          : status.identity === 'UNDER_REVIEW'
            ? 'Our team is reviewing your verification. No action needed right now.'
            : 'Verify your identity with our secure provider.',
      state:
        status.identity === 'VERIFIED'
          ? 'complete'
          : status.identity === 'UNDER_REVIEW'
            ? 'attention'
            : 'active',
      ...(status.identity === 'NOT_STARTED' || status.identity === 'PENDING'
        ? { action: { label: 'Verify your identity', run: startIdentity } }
        : {}),
    },
    {
      key: 'retainer',
      title: 'Retainer agreement',
      detail: status.retainerSigned
        ? 'Signed — thank you.'
        : 'Review and sign the limited-scope retainer.',
      state: status.retainerSigned ? 'complete' : 'active',
      ...(status.retainerSigned
        ? {}
        : { action: { label: 'Review & sign', run: startRetainer } }),
    },
    {
      key: 'payment',
      title: 'Payment',
      detail:
        status.payment === 'SETTLED'
          ? 'Payment received.'
          : status.payment === 'AWAITING_EMT'
            ? 'Waiting for your e-Transfer. We confirm receipt manually.'
            : status.totalCents !== null && status.currency
              ? `Total: ${money(status.totalCents, status.currency)}.`
              : 'Pay by card or e-Transfer.',
      state:
        status.payment === 'SETTLED' ? 'complete' : status.payment === 'AWAITING_EMT' ? 'attention' : 'active',
      ...(status.payment === 'SETTLED' || status.payment === 'AWAITING_EMT'
        ? {}
        : { action: { label: 'Pay by card', run: startCardPayment } }),
    },
    {
      key: 'letter',
      title: 'Letter preparation & delivery',
      detail:
        status.letter === 'DELIVERED'
          ? 'Your cease-and-desist letter was delivered.'
          : status.letter === 'SENT'
            ? 'Your letter has been sent.'
            : status.letter === 'PREPARING'
              ? 'A lawyer is preparing and reviewing your letter.'
              : 'Letters are prepared after the steps above are complete.',
      state:
        status.letter === 'DELIVERED' || status.letter === 'SENT'
          ? 'complete'
          : status.letter === 'PREPARING'
            ? 'active'
            : 'pending',
    },
  ];

  const activeIndex = steps.findIndex((s) => s.state === 'active' || s.state === 'attention');

  return (
    <div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <ol className="tracker">
        {steps.map((step, i) => (
          <li
            key={step.key}
            className={`tracker-step ${step.state}`}
            aria-current={i === activeIndex ? 'step' : undefined}
          >
            <span className="tracker-marker" aria-hidden="true">
              {step.state === 'complete' ? '✓' : step.state === 'attention' ? '!' : i + 1}
            </span>
            <div className="tracker-body">
              <h2>{step.title}</h2>
              <p>{step.detail}</p>
              {step.action ? (
                <div className="tracker-actions">
                  <button className="cta" disabled={busy} onClick={() => void step.action!.run()}>
                    {step.action.label}
                  </button>
                  {step.key === 'payment' ? (
                    <button className="cta secondary" disabled={busy} onClick={() => void startEmt()}>
                      Pay by e-Transfer
                    </button>
                  ) : null}
                  {step.key === 'retainer' ? (
                    <button className="cta secondary" disabled={busy} onClick={() => void confirmRetainer()}>
                      I&apos;ve signed
                    </button>
                  ) : null}
                </div>
              ) : null}
              {step.key === 'payment' && emtInstructions ? (
                <p className="tracker-note">{emtInstructions}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
