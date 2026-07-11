import type { NextRequest } from 'next/server';
import { intakePatchSchema } from '@stopallcalls/contracts';
import { saveProfile, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireSessionToken, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const token = requireSessionToken(req);
    const { id } = await params;
    const body = intakePatchSchema.parse(await req.json());
    const intake = await saveProfile(getIntakeStore(), token, id, body.profile ?? {}, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}
