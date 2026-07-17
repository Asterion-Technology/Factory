import type { NextRequest } from 'next/server';
import { addAgencySchema } from '@stopallcalls/contracts';
import { addAgency, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const body = addAgencySchema.parse(await req.json());
    const intake = await addAgency(getIntakeStore(), session.email, id, body.agency, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) }, 201);
  });
}
