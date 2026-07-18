import type { D1Like } from './d1';

// CLIO-001: Clio OAuth tokens at rest — AES-256-GCM envelope with a key from
// the CLIO_TOKEN_KEY secret (64 hex chars). Tokens are decrypted only
// server-side at call time and never serialized to clients or logs.

export interface ClioConnectionRecord {
  id: string;
  /** Clio user/firm reference captured at connect time. */
  tenantRef: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClioConnectionStore {
  /** Single-tenant for now: at most one active connection. */
  get(): Promise<ClioConnectionRecord | null>;
  upsert(record: ClioConnectionRecord): Promise<void>;
  delete(): Promise<void>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fromHex = (hex: string): Uint8Array => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('CLIO_TOKEN_KEY must be 64 hex characters (32 bytes)');
  }
  return new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
};

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function importKey(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromHex(keyHex) as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(keyHex: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(keyHex);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return `${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(keyHex: string, sealed: string): Promise<string> {
  const [ivB64, dataB64] = sealed.split('.');
  if (!ivB64 || !dataB64) throw new Error('malformed sealed secret');
  const key = await importKey(keyHex);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as BufferSource },
    key,
    fromB64(dataB64) as BufferSource,
  );
  return decoder.decode(plaintext);
}

export class InMemoryClioConnectionStore implements ClioConnectionStore {
  private record: ClioConnectionRecord | null = null;

  async get(): Promise<ClioConnectionRecord | null> {
    return this.record ? structuredClone(this.record) : null;
  }

  async upsert(record: ClioConnectionRecord): Promise<void> {
    this.record = structuredClone(record);
  }

  async delete(): Promise<void> {
    this.record = null;
  }
}

interface ConnectionRow {
  id: string;
  tenant_ref: string;
  token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export class D1ClioConnectionStore implements ClioConnectionStore {
  constructor(private readonly db: D1Like) {}

  async get(): Promise<ClioConnectionRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM clio_connections ORDER BY created_at DESC LIMIT 1')
      .first<ConnectionRow>();
    if (!row) return null;
    return {
      id: row.id,
      tenantRef: row.tenant_ref,
      accessTokenEncrypted: row.token_encrypted,
      refreshTokenEncrypted: row.refresh_token_encrypted,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsert(record: ClioConnectionRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO clio_connections (id, tenant_ref, token_encrypted, refresh_token_encrypted, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET token_encrypted = excluded.token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
      )
      .bind(
        record.id,
        record.tenantRef,
        record.accessTokenEncrypted,
        record.refreshTokenEncrypted,
        record.expiresAt,
        record.createdAt,
        record.updatedAt,
      )
      .run();
  }

  async delete(): Promise<void> {
    await this.db.prepare('DELETE FROM clio_connections').run();
  }
}
