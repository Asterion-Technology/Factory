// RAD-18: real outbound email via Resend, implementing the EmailAdapter port
// (DLV-001..006 contract unchanged — callers own idempotency keys and retry
// policy; this adapter forwards the key as Resend's Idempotency-Key header so
// provider-side retries cannot double-send either).
//
// Selection follows the Turnstile pattern (INT-008): the app uses this
// adapter only when RESEND_API_KEY is configured; the fake stays the DEV-003
// default, and E2E never touches the network.
//
// PII rule: recipient addresses, subjects, and bodies never appear in errors
// or logs — failures surface only the HTTP status and Resend's error `name`.

import type { EmailAdapter } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function toBase64(bytes: Uint8Array): string {
  // Workers-safe (no Buffer): chunked to keep the fromCharCode arg list small.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface ResendEmailConfig {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class ResendEmailAdapter implements EmailAdapter {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ResendEmailConfig) {
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(input: {
    idempotencyKey: string;
    to: string;
    bcc?: string;
    from: string;
    subject: string;
    text: string;
    attachments?: { filename: string; bytes: Uint8Array; contentType: string }[];
  }): Promise<{ messageId: string; status: 'QUEUED' | 'SENT' }> {
    const payload: Record<string, unknown> = {
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    };
    if (input.bcc) payload['bcc'] = [input.bcc];
    if (input.attachments?.length) {
      payload['attachments'] = input.attachments.map((a) => ({
        filename: a.filename,
        content: toBase64(a.bytes),
        content_type: a.contentType,
      }));
    }

    const res = await this.fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let name = 'unknown_error';
      try {
        const err = (await res.json()) as { name?: string };
        if (typeof err.name === 'string') name = err.name;
      } catch {
        // body unreadable — status alone is the diagnostic
      }
      throw new Error(`Resend send failed: ${res.status} ${name}`);
    }

    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new Error('Resend send failed: response missing id');
    // Resend accepts and queues; DELIVERED/BOUNCED tracking is a webhook
    // concern (matter state machine), not a send-time result.
    return { messageId: body.id, status: 'QUEUED' };
  }
}
