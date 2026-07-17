import type { StorageAdapter } from './types';

// R2-backed storage (EVD-003/EVD-006). Browser uploads go to a short-lived
// SigV4-presigned PUT URL (S3 API); server-side reads/deletes use the R2
// bucket binding directly, so the S3 credentials are only ever used to sign.
// Credentials arrive via Worker secrets — never configuration files.

interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
}

export interface R2StorageConfig {
  bucket: R2BucketLike;
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Injectable for deterministic signing tests. */
  now?: () => Date;
}

const encoder = new TextEncoder();

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const sha256Hex = async (data: string): Promise<string> => hex(await crypto.subtle.digest('SHA-256', encoder.encode(data)));

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

// RFC 3986 strict encoding as S3 requires (keys here are UUID-based, but
// encode defensively anyway).
const rfc3986 = (segment: string): string =>
  encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export class R2StorageAdapter implements StorageAdapter {
  constructor(private readonly config: R2StorageConfig) {}

  async createSignedUploadUrl(input: {
    key: string;
    mimeType: string;
    maxSizeBytes: number;
    expiresSeconds: number;
  }): Promise<{ url: string; method: 'PUT' }> {
    const { accountId, bucketName, accessKeyId, secretAccessKey } = this.config;
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${rfc3986(bucketName)}/${input.key.split('/').map(rfc3986).join('/')}`;

    const at = this.config.now?.() ?? new Date();
    const amzDate = at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = amzDate.slice(0, 8);
    const scope = `${date}/auto/s3/aws4_request`;

    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(input.expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    });
    query.sort();

    const canonicalRequest = ['PUT', canonicalUri, query.toString(), `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join(
      '\n',
    );
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');

    let key: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${secretAccessKey}`);
    for (const part of [date, 'auto', 's3', 'aws4_request']) {
      key = await hmac(key, part);
    }
    const signature = hex(await hmac(key, stringToSign));

    return { url: `https://${host}${canonicalUri}?${query.toString()}&X-Amz-Signature=${signature}`, method: 'PUT' };
  }

  async getObject(key: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const object = await this.config.bucket.get(key);
    if (!object) return null;
    return {
      bytes: new Uint8Array(await object.arrayBuffer()),
      mimeType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.config.bucket.delete(key);
  }
}
