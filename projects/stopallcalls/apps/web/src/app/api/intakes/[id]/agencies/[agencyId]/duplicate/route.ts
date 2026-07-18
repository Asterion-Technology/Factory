import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { duplicateAgency, toClientIntake } from '@stopallcalls/db';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getIntakeStore } from '@/lib/store';

const duplicateSchema = z.object({ expectedVersion: z.number().int().positive() });

// INT-004 duplicate: copies the entry as a new independent agency row.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agencyId: string }> },
) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id, agencyId } = await params;
    const body = duplicateSchema.parse(await req.json());
    const intake = await duplicateAgency(getIntakeStore(), session.email, id, agencyId, body.expectedVersion);
    return jsonOk({ intake: toClientIntake(intake) }, 201);
  });
}
