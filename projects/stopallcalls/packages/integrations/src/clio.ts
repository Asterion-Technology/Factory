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

  async uploadDocument(input: {
    idempotencyKey: string;
    matterClioId: string;
    filename: string;
    bytes: Uint8Array;
  }): Promise<{ clioDocumentId: string }> {
    // Clio v4 three-step upload: create the document shell (returns a
    // presigned put_url), PUT the bytes to that URL, then mark the version
    // fully uploaded. Idempotency is enforced upstream by the delivery ledger.
    const created = await this.request<{
      data: {
        id: number;
        latest_document_version: { uuid: string; put_url: string; put_headers: { name: string; value: string }[] };
      };
    }>(`/documents.json?fields=id,latest_document_version{uuid,put_url,put_headers}`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          name: input.filename,
          parent: { id: Number(input.matterClioId), type: 'Matter' },
        },
      }),
    });
    const version = created.data.latest_document_version;
    const putHeaders = Object.fromEntries(version.put_headers.map((h) => [h.name, h.value]));
    const putRes = await fetch(version.put_url, {
      method: 'PUT',
      headers: putHeaders,
      body: input.bytes as unknown as BodyInit,
    });
    if (!putRes.ok) {
      throw new Error(`Clio document PUT returned ${putRes.status}`);
    }
    await this.request(`/documents/${created.data.id}.json?fields=id`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: { uuid: version.uuid, fully_uploaded: true },
      }),
    });
    return { clioDocumentId: String(created.data.id) };
  }
}
