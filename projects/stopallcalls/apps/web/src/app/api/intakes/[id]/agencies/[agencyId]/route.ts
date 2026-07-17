import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { removeAgency, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

const deleteSchema = z.object({ expectedVersion: z.number().int().positive() });

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agencyId: string }> },
) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id, agencyId } = await params;
    const body = deleteSchema.parse(await req.json());
    const intake = await removeAgency(getIntakeStore(), session.email, id, agencyId, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}
