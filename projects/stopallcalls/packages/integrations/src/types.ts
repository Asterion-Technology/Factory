// Provider adapter contracts (SRS ARC-002, §7 portability requirement).
// Domain code depends only on these interfaces; provider SDKs live in adapter
// implementations. Every mutating call takes an idempotency key (WF-003).

export interface ClioContactSummary {
  clioId: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface ClioMatterRef {
  clioId: string;
  displayNumber: string;
}

export interface ClioAdapter {
  searchContacts(query: string): Promise<ClioContactSummary[]>;
  createContact(input: {
    idempotencyKey: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customFields?: Record<string, string>;
  }): Promise<ClioContactSummary>;
  createMatter(input: {
    idempotencyKey: string;
    contactClioId: string;
    // CLIO-006: "[Last], [First] v. [Collection Agency]"
    description: string;
    customFields?: Record<string, string>;
  }): Promise<ClioMatterRef>;
  uploadDocument(input: {
    idempotencyKey: string;
    matterClioId: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<{ clioDocumentId: string }>;
}

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PaymentAdapter {
  // PAY-003: hosted fields/pages only — this app never sees PAN/CVV.
  createHostedCheckout(input: {
    idempotencyKey: string;
    orderId: string;
    amountCents: number;
    currency: string;
  }): Promise<{ providerRef: string; redirectUrl: string }>;
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
  getStatus(providerRef: string): Promise<PaymentStatus>;
}

export type IdentityStatus = 'PENDING' | 'VERIFIED' | 'MISMATCH' | 'FAILED';

export interface IdentityAdapter {
  createSession(input: {
    idempotencyKey: string;
    clientRef: string;
  }): Promise<{ providerRef: string; sessionUrl: string }>;
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
  getResult(providerRef: string): Promise<{
    status: IdentityStatus;
    // IDV-002: redacted match results only — never raw documents/biometrics.
    checks: Record<string, 'MATCH' | 'MISMATCH' | 'UNAVAILABLE'>;
  }>;
}

export interface SignatureAdapter {
  createEnvelope(input: {
    idempotencyKey: string;
    retainerVersionId: string;
    retainerContentHash: string;
    signerEmail: string;
    signerName: string;
  }): Promise<{ envelopeId: string; signingUrl: string }>;
  getEnvelopeStatus(envelopeId: string): Promise<'SENT' | 'VIEWED' | 'SIGNED' | 'DECLINED'>;
}

export interface EmailAdapter {
  send(input: {
    idempotencyKey: string;
    to: string;
    bcc?: string;
    from: string;
    subject: string;
    text: string;
    attachments?: { filename: string; bytes: Uint8Array; contentType: string }[];
  }): Promise<{ messageId: string; status: 'QUEUED' | 'SENT' }>;
}

export interface TurnstileAdapter {
  // INT-008: server-side verification of the client challenge token. The real
  // adapter calls Cloudflare siteverify with TURNSTILE_SECRET_KEY (wrangler
  // secret; never in code) once Cloudflare provisioning is approved.
  verify(input: { token: string; remoteIp?: string }): Promise<boolean>;
}

export interface PdfAdapter {
  render(input: {
    templateId: string;
    data: Record<string, string>;
  }): Promise<{ bytes: Uint8Array; sha256: string }>;
}
