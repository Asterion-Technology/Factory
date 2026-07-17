import type { NextRequest } from 'next/server';
import { finalizeEvidenceUpload, toClientEvidence } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getEvidenceStore, getIntakeStore, getMalwareScanner, getStorageAdapter } from '@/lib/store';

// EVD-004/005: verify bytes against the declared type, hash, quarantine, and
// scan. Runs inline with the fake scanner; the deployed path moves the scan
// to the jobs queue consumer behind the same FinalizeDeps shape.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id, evidenceId } = await params;
    const storage = getStorageAdapter();
    const scanner = getMalwareScanner();
    const record = await finalizeEvidenceUpload(getEvidenceStore(), getIntakeStore(), session.email, id, evidenceId, {
      getObject: (key) => storage.getObject(key),
      deleteObject: (key) => storage.deleteObject(key),
      scan: (bytes) => scanner.scan(bytes),
    });
    return jsonOk({ evidence: toClientEvidence(record) });
  });
}
