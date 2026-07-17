import { describe, expect, it } from 'vitest';
import { R2StorageAdapter } from '../src/index';

// Live presign check against the real dev bucket. Opt-in only: requires
// R2_LIVE_ACCOUNT_ID / R2_LIVE_ACCESS_KEY_ID / R2_LIVE_SECRET (derive the
// secret as SHA-256 of the Cloudflare API token per R2's S3-auth docs).
// Skipped everywhere else — CI and normal local runs stay offline.
const account = process.env.R2_LIVE_ACCOUNT_ID;
const accessKeyId = process.env.R2_LIVE_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_LIVE_SECRET;

describe.skipIf(!account || !accessKeyId || !secretAccessKey)('R2 presign (live)', () => {
  it('a presigned PUT is accepted by the real bucket', async () => {
    const adapter = new R2StorageAdapter({
      bucket: { get: async () => null, delete: async () => undefined },
      accountId: account!,
      bucketName: 'stopallcalls-evidence-dev',
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    });
    const key = `verify/presign-check-${crypto.randomUUID()}.txt`;
    const { url } = await adapter.createSignedUploadUrl({
      key,
      mimeType: 'text/plain',
      maxSizeBytes: 100,
      expiresSeconds: 300,
    });
    const put = await fetch(url, { method: 'PUT', body: 'presign verification payload' });
    expect(put.status).toBe(200);
  }, 30_000);
});
