import type { NextRequest } from 'next/server';
import { evidenceUploadRequestSchema } from '@stopallcalls/contracts';
import { listEvidence, requestEvidenceUpload, toClientEvidence } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getEvidenceStore, getIntakeStore, getStorageAdapter } from '@/lib/store';

// EVD-003: the server validates and reserves the slot, then hands the client
// a short-lived signed URL — file bytes never pass through this route.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const body = evidenceUploadRequestSchema.parse(await req.json());
    const record = await requestEvidenceUpload(getEvidenceStore(), getIntakeStore(), session.email, id, body);
    const upload = await getStorageAdapter().createSignedUploadUrl({
      key: record.storageKey,
      mimeType: record.mimeType,
      maxSizeBytes: record.sizeBytes,
      expiresSeconds: 15 * 60,
    });
    return jsonOk({ evidence: toClientEvidence(record), upload }, 201);
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const records = await listEvidence(getEvidenceStore(), getIntakeStore(), session.email, id);
    return jsonOk({ evidence: records.map(toClientEvidence) });
  });
}
