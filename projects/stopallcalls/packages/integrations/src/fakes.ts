// Deterministic in-memory fakes (DEV-003): the default providers for local
// development and tests. Repeated calls with the same idempotency key return
// the same resource, mirroring the required real-adapter behavior.

import type {
  ClioAdapter,
  ClioContactSummary,
  ClioMatterRef,
  EmailAdapter,
  IdentityAdapter,
  IdentityStatus,
  PaymentAdapter,
  PaymentStatus,
  PdfAdapter,
  SignatureAdapter,
  TurnstileAdapter,
} from './types';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class FakeClioAdapter implements ClioAdapter {
  private contacts = new Map<string, ClioContactSummary>();
  private matters = new Map<string, ClioMatterRef>();
  private documents = new Map<string, string>();
  private seq = 0;

  async searchContacts(query: string): Promise<ClioContactSummary[]> {
    const q = query.toLowerCase();
    return [...this.contacts.values()].filter((c) => c.name.toLowerCase().includes(q));
  }

  async createContact(input: {
    idempotencyKey: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }): Promise<ClioContactSummary> {
    const existing = this.contacts.get(input.idempotencyKey);
    if (existing) return existing;
    const contact: ClioContactSummary = {
      clioId: `fake-contact-${++this.seq}`,
      name: `${input.firstName} ${input.lastName}`,
      email: input.email,
      phone: input.phone,
    };
    this.contacts.set(input.idempotencyKey, contact);
    return contact;
  }

  async createMatter(input: {
    idempotencyKey: string;
    contactClioId: string;
    description: string;
  }): Promise<ClioMatterRef> {
    const existing = this.matters.get(input.idempotencyKey);
    if (existing) return existing;
    const matter: ClioMatterRef = {
      clioId: `fake-matter-${++this.seq}`,
      displayNumber: `FAKE-${String(this.seq).padStart(5, '0')}`,
    };
    this.matters.set(input.idempotencyKey, matter);
    return matter;
  }

  async uploadDocument(input: {
    idempotencyKey: string;
    matterClioId: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<{ clioDocumentId: string }> {
    let id = this.documents.get(input.idempotencyKey);
    if (!id) {
      id = `fake-doc-${++this.seq}`;
      this.documents.set(input.idempotencyKey, id);
    }
    return { clioDocumentId: id };
  }
}

export class FakePaymentAdapter implements PaymentAdapter {
  private checkouts = new Map<string, { providerRef: string; redirectUrl: string }>();
  private statuses = new Map<string, PaymentStatus>();
  private seq = 0;

  async createHostedCheckout(input: {
    idempotencyKey: string;
    orderId: string;
    amountCents: number;
    currency: string;
  }): Promise<{ providerRef: string; redirectUrl: string }> {
    const existing = this.checkouts.get(input.idempotencyKey);
    if (existing) return existing;
    const providerRef = `fake-pay-${++this.seq}`;
    const checkout = { providerRef, redirectUrl: `https://payments.example.test/checkout/${providerRef}` };
    this.checkouts.set(input.idempotencyKey, checkout);
    this.statuses.set(providerRef, 'PENDING');
    return checkout;
  }

  async verifyWebhookSignature(_payload: string, signature: string): Promise<boolean> {
    return signature === 'fake-valid-signature';
  }

  async getStatus(providerRef: string): Promise<PaymentStatus> {
    return this.statuses.get(providerRef) ?? 'FAILED';
  }

  // Test hook: simulate the provider settling a payment.
  settle(providerRef: string, status: PaymentStatus): void {
    this.statuses.set(providerRef, status);
  }
}

export class FakeIdentityAdapter implements IdentityAdapter {
  private sessions = new Map<string, { providerRef: string; sessionUrl: string }>();
  private results = new Map<string, IdentityStatus>();
  private seq = 0;

  async createSession(input: {
    idempotencyKey: string;
    clientRef: string;
  }): Promise<{ providerRef: string; sessionUrl: string }> {
    const existing = this.sessions.get(input.idempotencyKey);
    if (existing) return existing;
    const providerRef = `fake-idv-${++this.seq}`;
    const session = { providerRef, sessionUrl: `https://identity.example.test/verify/${providerRef}` };
    this.sessions.set(input.idempotencyKey, session);
    this.results.set(providerRef, 'PENDING');
    return session;
  }

  async verifyWebhookSignature(_payload: string, signature: string): Promise<boolean> {
    return signature === 'fake-valid-signature';
  }

  async getResult(providerRef: string): Promise<{
    status: IdentityStatus;
    checks: Record<string, 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'>;
  }> {
    const status = this.results.get(providerRef) ?? 'FAILED';
    const check = status === 'VERIFIED' ? 'MATCH' : status === 'MISMATCH' ? 'MISMATCH' : 'UNAVAILABLE';
    return { status, checks: { name: check, dob: check, address: check } };
  }

  complete(providerRef: string, status: IdentityStatus): void {
    this.results.set(providerRef, status);
  }
}

export class FakeSignatureAdapter implements SignatureAdapter {
  private envelopes = new Map<string, { envelopeId: string; signingUrl: string }>();
  private statuses = new Map<string, 'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED'>();
  private seq = 0;

  async createEnvelope(input: {
    idempotencyKey: string;
    retainerVersionId: string;
    retainerContentHash: string;
    signerEmail: string;
    signerName: string;
  }): Promise<{ envelopeId: string; signingUrl: string }> {
    const existing = this.envelopes.get(input.idempotencyKey);
    if (existing) return existing;
    const envelopeId = `fake-env-${++this.seq}`;
    const envelope = { envelopeId, signingUrl: `https://sign.example.test/${envelopeId}` };
    this.envelopes.set(input.idempotencyKey, envelope);
    this.statuses.set(envelopeId, 'SENT');
    return envelope;
  }

  async getEnvelopeStatus(envelopeId: string): Promise<'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED'> {
    return this.statuses.get(envelopeId) ?? 'DECLINED';
  }

  sign(envelopeId: string): void {
    this.statuses.set(envelopeId, 'SIGNED');
  }
}

export class FakeEmailAdapter implements EmailAdapter {
  readonly sent: { idempotencyKey: string; to: string; subject: string; messageId: string }[] = [];
  private byKey = new Map<string, { messageId: string; status: 'QUEUED' | 'SENT' }>();
  private seq = 0;

  async send(input: {
    idempotencyKey: string;
    to: string;
    from: string;
    subject: string;
    text: string;
  }): Promise<{ messageId: string; status: 'QUEUED' | 'SENT' }> {
    // DLV-006: retries with the same key must not send duplicates.
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    const result = { messageId: `fake-msg-${++this.seq}`, status: 'SENT' as const };
    this.byKey.set(input.idempotencyKey, result);
    this.sent.push({
      idempotencyKey: input.idempotencyKey,
      to: input.to,
      subject: input.subject,
      messageId: result.messageId,
    });
    return result;
  }
}

export class FakeTurnstileAdapter implements TurnstileAdapter {
  // 'turnstile-fail' lets tests exercise the rejection path deterministically.
  async verify(input: { token: string; remoteIp?: string }): Promise<boolean> {
    return input.token.length > 0 && input.token !== 'turnstile-fail';
  }
}

export class FakePdfAdapter implements PdfAdapter {
  async render(input: {
    templateId: string;
    data: Record<string, string>;
  }): Promise<{ bytes: Uint8Array; sha256: string }> {
    const canonical = `${input.templateId}\n${JSON.stringify(input.data, Object.keys(input.data).sort())}`;
    const bytes = new TextEncoder().encode(`%FAKE-PDF%\n${canonical}`);
    return { bytes, sha256: await sha256Hex(bytes) };
  }
}
