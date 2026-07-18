import { describe, expect, it } from 'vitest';
import { InMemoryClioConnectionStore, decryptSecret, encryptSecret } from '../src/index';

const KEY = 'a'.repeat(64);

describe('token encryption at rest (CLIO-001)', () => {
  it('round-trips and never stores plaintext', async () => {
    const sealed = await encryptSecret(KEY, 'super-secret-token');
    expect(sealed).not.toContain('super-secret-token');
    expect(await decryptSecret(KEY, sealed)).toBe('super-secret-token');
  });

  it('produces a fresh IV per encryption', async () => {
    const a = await encryptSecret(KEY, 'same');
    const b = await encryptSecret(KEY, 'same');
    expect(a).not.toBe(b);
  });

  it('rejects the wrong key and malformed input', async () => {
    const sealed = await encryptSecret(KEY, 'value');
    await expect(decryptSecret('b'.repeat(64), sealed)).rejects.toThrow();
    await expect(decryptSecret(KEY, 'not-sealed')).rejects.toThrow();
    await expect(encryptSecret('short', 'value')).rejects.toThrow('64 hex');
  });
});

describe('InMemoryClioConnectionStore', () => {
  it('upserts and deletes the single connection', async () => {
    const store = new InMemoryClioConnectionStore();
    expect(await store.get()).toBeNull();
    const record = {
      id: 'c1',
      tenantRef: '42:Eric',
      accessTokenEncrypted: 'sealed-a',
      refreshTokenEncrypted: 'sealed-r',
      expiresAt: '2999-01-01T00:00:00.000Z',
      createdAt: '2026-07-17T00:00:00.000Z',
      updatedAt: '2026-07-17T00:00:00.000Z',
    };
    await store.upsert(record);
    expect((await store.get())?.tenantRef).toBe('42:Eric');
    await store.delete();
    expect(await store.get()).toBeNull();
  });
});
