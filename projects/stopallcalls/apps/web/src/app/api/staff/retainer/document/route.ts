import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getDocumentSink } from '@/lib/store';

// RAD-27 (RET-004 support): staff uploads the retainer PDF; the server hashes
// the EXACT stored bytes — that hash is what every signature envelope binds
// to, so it is computed here, never trusted from the client. Raw body upload
// (staff-only, small files); content-addressed key means re-uploading the
// same document is naturally idempotent and nothing is ever overwritten with
// different content.

const MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

const querySchema = z.object({
  jurisdiction: z.string().trim().min(2).max(8),
});

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { jurisdiction } = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));

    const bytes = await req.arrayBuffer();
    if (bytes.byteLength === 0) return jsonError(422, 'EMPTY_FILE', 'The uploaded file is empty.');
    if (bytes.byteLength > MAX_BYTES) {
      return jsonError(413, 'FILE_TOO_LARGE', 'Retainer documents must be 10 MB or smaller.');
    }
    const head = new Uint8Array(bytes.slice(0, PDF_MAGIC.length));
    if (!PDF_MAGIC.every((b, i) => head[i] === b)) {
      return jsonError(422, 'NOT_A_PDF', 'The retainer document must be a PDF.');
    }

    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const contentHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const storageKey = `retainers/${jurisdiction.toUpperCase()}/${contentHash}.pdf`;
    await getDocumentSink().put(storageKey, bytes);

    return jsonOk({ contentHash, storageKey, sizeBytes: bytes.byteLength });
  });
}
