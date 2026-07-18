import { describe, expect, it } from 'vitest';
import { R2StorageAdapter, type R2BucketLike } from '../src/index';

const bucketStub: R2BucketLike = {
  get: async () => null,
  delete: async () => undefined,
};

const config = {
  bucket: bucketStub,
  accountId: 'acct1234',
  bucketName: 'test-bucket',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'testsecret',
  now: () => new Date('2026-07-16T12:00:00.000Z'),
};

const INPUT = { key: 'evidence/intake-1/file-1.png', mimeType: 'image/png', maxSizeBytes: 100, expiresSeconds: 900 };

describe('R2StorageAdapter presigned PUT (EVD-003)', () => {
  it('produces a well-formed SigV4 query-presigned URL', async () => {
    const { url, method } = await new R2StorageAdapter(config).createSignedUploadUrl(INPUT);
    expect(method).toBe('PUT');
    const parsed = new URL(url);
    expect(parsed.host).toBe('acct1234.r2.cloudflarestorage.com');
    expect(parsed.pathname).toBe('/test-bucket/evidence/intake-1/file-1.png');
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe('AKIDEXAMPLE/20260716/auto/s3/aws4_request');
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20260716T120000Z');
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs deterministically and reacts to secret changes', async () => {
    const a = await new R2StorageAdapter(config).createSignedUploadUrl(INPUT);
    const b = await new R2StorageAdapter(config).createSignedUploadUrl(INPUT);
    expect(a.url).toBe(b.url);
    const other = await new R2StorageAdapter({ ...config, secretAccessKey: 'different' }).createSignedUploadUrl(INPUT);
    expect(other.url).not.toBe(a.url);
  });
});
