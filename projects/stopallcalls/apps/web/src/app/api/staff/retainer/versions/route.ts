import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { publishRetainerVersion } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getRetainerVersionStore } from '@/lib/store';

// RET-001/RET-004: publishing a retainer version is a staff action and the
// only write the version store has — published versions are immutable.
const publishRequestSchema = z.object({
  jurisdiction: z.string().trim().min(2).max(8),
  language: z.string().trim().min(2).max(8).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  storageKey: z.string().trim().min(1).max(500),
});

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const body = publishRequestSchema.parse(await req.json());
    const version = await publishRetainerVersion(getRetainerVersionStore(), body);
    return jsonOk({ version });
  });
}
