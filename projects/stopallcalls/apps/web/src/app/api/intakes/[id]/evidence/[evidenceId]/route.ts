import type { NextRequest } from 'next/server';
import { removeEvidence, toClientEvidence } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getEvidenceStore, getIntakeStore, getStorageAdapter } from '@/lib/store';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id, evidenceId } = await params;
    const storage = getStorageAdapter();
    const record = await removeEvidence(
      getEvidenceStore(),
      getIntakeStore(),
      session.email,
      id,
      evidenceId,
      (key) => storage.deleteObject(key),
    );
    return jsonOk({ evidence: toClientEvidence(record) });
  });
}
