import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { addAgencySchema } from '@stopallcalls/contracts';
import { removeAgency, toClientIntake, updateAgency } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

const deleteSchema = z.object({ expectedVersion: z.number().int().positive() });

// INT-004 edit: full-entry replacement (same body shape as add).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agencyId: string }> },
) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id, agencyId } = await params;
    const body = addAgencySchema.parse(await req.json());
    const intake = await updateAgency(getIntakeStore(), session.email, id, agencyId, body.agency, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}

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
