import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { publishLetterTemplate } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { getLetterTemplateStore } from '@/lib/store';

// LTR-001: template publishing is append-only staff configuration; the body
// text is a legal artifact reviewed by counsel before use. Interim admin gate.
const publishRequestSchema = z.object({
  jurisdiction: z.string().trim().min(2).max(8),
  version: z.number().int().positive(),
  body: z.string().min(1).max(50_000),
});

export async function POST(req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const body = publishRequestSchema.parse(await req.json());
    const template = await publishLetterTemplate(getLetterTemplateStore(), body);
    return jsonOk({ template: { ...template, body: undefined }, });
  });
}
