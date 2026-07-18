import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateLetterVersion } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled } from '@/lib/clio';
import { computeGatesForMatter } from '@/lib/gates';
import {
  getApprovalStore,
  getIntakeStore,
  getLetterTemplateStore,
  getLetterVersionStore,
  getMatterStore,
  getPdfAdapter,
} from '@/lib/store';

// LTR-001..006: staff letter workspace. POST generates (or refreshes) the
// deterministic draft; GET returns the review payload — current + prior
// content for diff, approvals, and the live gate snapshot. Interim admin gate.

const generateRequestSchema = z.object({
  author: z.string().trim().min(1).max(200),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ matterId: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { matterId } = await params;
    const body = generateRequestSchema.parse(await req.json());
    const matter = await getMatterStore().getById(matterId);
    if (!matter) return jsonError(404, 'NOT_FOUND', 'Matter not found.');
    const intake = await getIntakeStore().getById(matter.intakeId);
    if (!intake) return jsonError(404, 'NOT_FOUND', 'Intake not found.');
    const version = await generateLetterVersion(
      {
        templates: getLetterTemplateStore(),
        versions: getLetterVersionStore(),
        matters: getMatterStore(),
        pdf: getPdfAdapter(),
      },
      intake,
      matterId,
      { author: body.author, letterDate: new Date().toISOString().slice(0, 10) },
    );
    return jsonOk({ version });
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ matterId: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { matterId } = await params;
    const matter = await getMatterStore().getById(matterId);
    if (!matter) return jsonError(404, 'NOT_FOUND', 'Matter not found.');
    const versions = await getLetterVersionStore().listByMatter(matterId);
    const current = versions.filter((v) => v.status !== 'SUPERSEDED').at(-1) ?? null;
    const prior = versions.filter((v) => v.status === 'SUPERSEDED').at(-1) ?? null;
    const approvals = current ? await getApprovalStore().listByLetterVersion(current.id) : [];
    return jsonOk({
      matterState: matter.state,
      current,
      priorContent: prior?.sourceSnapshot.renderedContent ?? null,
      approvals,
      gates: await computeGatesForMatter(matter),
    });
  });
}
