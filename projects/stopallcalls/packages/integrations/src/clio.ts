import type { ClioAdapter, ClioContactSummary, ClioMatterRef } from './types';

// Real Clio Manage v4 adapter (CLIO-004..006). Token acquisition (and
// refresh) is injected so this stays storage-agnostic; idempotency keys are
// accepted per the interface but enforced upstream by the mapping ledger —
// Clio's API has no native idempotency support.

export interface RealClioConfig {
  /** Regional instance, e.g. https://app.clio.com (no trailing slash). */
  baseUrl: string;
  getAccessToken(): Promise<string>;
}

interface ClioContactData {
  id: number;
  name: string;
  primary_email_address?: string | null;
  primary_phone_number?: string | null;
}

const toSummary = (data: ClioContactData): ClioContactSummary => ({
  clioId: String(data.id),
  name: data.name,
  ...(data.primary_email_address ? { email: data.primary_email_address } : {}),
  ...(data.primary_phone_number ? { phone: data.primary_phone_number } : {}),
});

export class RealClioAdapter implements ClioAdapter {
  constructor(private readonly config: RealClioConfig) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.config.getAccessToken();
    const res = await fetch(`${this.config.baseUrl}/api/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      // Status only — Clio error bodies can echo request payloads.
      throw new Error(`Clio API ${path.split('?')[0]} returned ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async searchContacts(query: string): Promise<ClioContactSummary[]> {
    const params = new URLSearchParams({
      query,
      fields: 'id,name,primary_email_address,primary_phone_number',
      limit: '25',
    });
    const body = await this.request<{ data: ClioContactData[] }>(`/contacts.json?${params.toString()}`);
    return body.data.map(toSummary);
  }

  async createContact(input: {
    idempotencyKey: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    customFields?: Record<string, string>;
  }): Promise<ClioContactSummary> {
    const body = await this.request<{ data: ClioContactData }>(
      `/contacts.json?fields=id,name,primary_email_address,primary_phone_number`,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'Person',
            first_name: input.firstName,
            last_name: input.lastName,
            email_addresses: [{ name: 'Home', address: input.email, default_email: true }],
            phone_numbers: [{ name: 'Mobile', number: input.phone, default_number: true }],
          },
        }),
      },
    );
    return toSummary(body.data);
  }

  async createMatter(input: {
    idempotencyKey: string;
    contactClioId: string;
    description: string;
    customFields?: Record<string, string>;
  }): Promise<ClioMatterRef> {
    const body = await this.request<{ data: { id: number; display_number: string } }>(
      `/matters.json?fields=id,display_number`,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            client: { id: Number(input.contactClioId) },
            description: input.description,
            status: 'open',
          },
        }),
      },
    );
    return { clioId: String(body.data.id), displayNumber: body.data.display_number };
  }

  async uploadDocument(_input: {
    idempotencyKey: string;
    matterClioId: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<{ clioDocumentId: string }> {
    // Phase 5 (LTR/DLV): Clio's multi-step document upload lands with letters.
    throw new Error('Clio document upload is not implemented until Phase 5.');
  }
}
