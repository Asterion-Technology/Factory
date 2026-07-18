import { describe, expect, it } from 'vitest';
import { ResendEmailAdapter } from '../src/index';

type Captured = { url: string; init: RequestInit };

function fetchStub(status: number, body: unknown, captured: Captured[]): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

const INPUT = {
  idempotencyKey: 'letter-send-m1-v3',
  to: 'agency@collections.test',
  bcc: 'client@consumer.test',
  from: 'letters@stopsallcalls.com',
  subject: 'Cease and desist — file 00001',
  text: 'Letter body.',
};

describe('ResendEmailAdapter (RAD-18, DLV-001..006 contract)', () => {
  it('POSTs the Resend payload with auth and the idempotency key as header', async () => {
    const captured: Captured[] = [];
    const adapter = new ResendEmailAdapter({ apiKey: 'rk_test', fetchImpl: fetchStub(200, { id: 'msg_1' }, captured) });

    const result = await adapter.send(INPUT);

    expect(result).toEqual({ messageId: 'msg_1', status: 'QUEUED' });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.resend.com/emails');
    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer rk_test');
    expect(headers['Idempotency-Key']).toBe('letter-send-m1-v3');
    const body = JSON.parse(String(captured[0]!.init.body));
    expect(body).toEqual({
      from: 'letters@stopsallcalls.com',
      to: ['agency@collections.test'],
      bcc: ['client@consumer.test'],
      subject: 'Cease and desist — file 00001',
      text: 'Letter body.',
    });
  });

  it('omits bcc when not provided and base64-encodes attachments', async () => {
    const captured: Captured[] = [];
    const adapter = new ResendEmailAdapter({ apiKey: 'rk_test', fetchImpl: fetchStub(200, { id: 'msg_2' }, captured) });

    await adapter.send({
      ...INPUT,
      bcc: undefined,
      attachments: [{ filename: 'letter.pdf', bytes: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' }],
    });

    const body = JSON.parse(String(captured[0]!.init.body));
    expect(body.bcc).toBeUndefined();
    expect(body.attachments).toEqual([
      { filename: 'letter.pdf', content: 'JVBERg==', content_type: 'application/pdf' },
    ]);
  });

  it('fails with status + error name only — never recipient, subject, or body', async () => {
    const adapter = new ResendEmailAdapter({
      apiKey: 'rk_test',
      fetchImpl: fetchStub(422, { name: 'validation_error', message: 'to agency@collections.test is invalid' }, []),
    });

    const err = await adapter.send(INPUT).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Resend send failed: 422 validation_error');
    expect((err as Error).message).not.toContain('agency@collections.test');
    expect((err as Error).message).not.toContain('Cease');
  });

  it('rejects a 2xx response that is missing an id', async () => {
    const adapter = new ResendEmailAdapter({ apiKey: 'rk_test', fetchImpl: fetchStub(200, {}, []) });
    await expect(adapter.send(INPUT)).rejects.toThrow('Resend send failed: response missing id');
  });
});
