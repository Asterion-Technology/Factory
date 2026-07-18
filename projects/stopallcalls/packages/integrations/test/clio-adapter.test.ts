import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealClioAdapter } from '../src/index';

const adapter = () =>
  new RealClioAdapter({ baseUrl: 'https://app.clio.test', getAccessToken: async () => 'token-1' });

const jsonResponse = (data: unknown) => ({ ok: true, json: async () => data }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe('RealClioAdapter', () => {
  it('searchContacts queries v4 with bearer auth and maps summaries', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { id: 42, name: 'Taylor Testcase', primary_email_address: 't@example.test', primary_phone_number: null },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const results = await adapter().searchContacts('Taylor');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://app.clio.test/api/v4/contacts.json?');
    expect(url).toContain('query=Taylor');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(results).toEqual([{ clioId: '42', name: 'Taylor Testcase', email: 't@example.test' }]);
  });

  it('createContact posts the v4 Person shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { id: 7, name: 'Taylor Testcase' } }));
    vi.stubGlobal('fetch', fetchMock);
    const contact = await adapter().createContact({
      idempotencyKey: 'k',
      firstName: 'Taylor',
      lastName: 'Testcase',
      email: 't@example.test',
      phone: '+15555550100',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.type).toBe('Person');
    expect(body.data.first_name).toBe('Taylor');
    expect(body.data.email_addresses[0]).toMatchObject({ address: 't@example.test', default_email: true });
    expect(body.data.phone_numbers[0]).toMatchObject({ number: '+15555550100', default_number: true });
    expect(contact.clioId).toBe('7');
  });

  it('createMatter posts client reference + description and maps display_number', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { id: 99, display_number: '00003-Testcase' } }));
    vi.stubGlobal('fetch', fetchMock);
    const matter = await adapter().createMatter({
      idempotencyKey: 'k',
      contactClioId: '7',
      description: 'Testcase, Taylor v. ABC Collections (Fictitious)',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.data.client).toEqual({ id: 7 });
    expect(body.data.description).toBe('Testcase, Taylor v. ABC Collections (Fictitious)');
    expect(matter).toEqual({ clioId: '99', displayNumber: '00003-Testcase' });
  });

  it('throws status-only errors and refuses document upload until Phase 5', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    await expect(adapter().searchContacts('x')).rejects.toThrow('429');
    await expect(
      adapter().uploadDocument({ idempotencyKey: 'k', matterClioId: '1', filename: 'f.pdf', bytes: new Uint8Array() }),
    ).rejects.toThrow('Phase 5');
  });
});
