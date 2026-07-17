import type { NextRequest } from 'next/server';
import { MAX_EVIDENCE_FILE_BYTES } from '@stopallcalls/contracts';
import { ServiceError } from '@stopallcalls/db';
import type { FakeStorageAdapter } from '@stopallcalls/integrations';
import { jsonError, jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getEvidenceStore, getIntakeStore, getStorageAdapter } from '@/lib/store';

// Local stand-in for the R2 signed-URL PUT (DEV-003). Real deployments
// presign directly against R2 and this route never matches an upload URL —
// it also refuses to operate unless the fake storage adapter is active.
// Authorization: the session must own the intake behind the reserved key,
// and the key must still be awaiting its upload.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  return withErrorHandling(async () => {
    // Duck-typed rather than instanceof: Next bundles each route separately,
    // so the workspace-package class has a different identity per route while
    // the globalThis singleton is shared. Only the fake exposes putObject;
    // with the real R2 adapter active this route stays a 404.
    const storage = getStorageAdapter() as Partial<FakeStorageAdapter>;
    if (typeof storage.putObject !== 'function' || typeof storage.getObject !== 'function') {
      return jsonError(404, 'NOT_FOUND', 'Not found.');
    }
    const session = await requireVerifiedSession(req);
    const { key } = await params;
    const storageKey = key.join('/');

    const record = await getEvidenceStore().findByStorageKey(storageKey);
    const intake = record ? await getIntakeStore().getById(record.intakeId) : null;
    if (!record || record.scanStatus !== 'PENDING_UPLOAD' || intake?.consumerKey !== session.email) {
      throw new ServiceError(404, 'NOT_FOUND', 'Upload target not found.');
    }

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > Math.min(record.sizeBytes, MAX_EVIDENCE_FILE_BYTES)) {
      throw new ServiceError(413, 'TOO_LARGE', 'The file exceeds the declared size.');
    }
    storage.putObject(storageKey, bytes, record.mimeType);
    return jsonOk({ received: bytes.byteLength });
  });
}
