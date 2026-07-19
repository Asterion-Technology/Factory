import type { NextRequest } from 'next/server';
import { intakeSubmitSchema } from '@stopallcalls/contracts';
import { ServiceError, submitIntake, toClientIntake } from '@stopallcalls/db';
import { assertIntakeOpen, MarketError, normalizeCanadianRegion } from '@stopallcalls/domain';
import { jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { startConflictCheck } from '@/lib/clio';
import { getIntakeStore, getMarketStore } from '@/lib/store';

// Freezes the submission snapshot (INT-007) and requests DRAFT → SUBMITTED
// through the domain transition guard (WF-001).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireVerifiedSession(req);
    const { id } = await params;
    const body = intakeSubmitSchema.parse(await req.json());

    // RAD-17: market gate at the consumer edge — an intake submits only when
    // its market is active AND the profile's region is allowlisted (Quebec
    // stays closed until counsel clears it). Applied before the snapshot
    // freezes; existing submitted cases are never re-gated.
    const draft = await getIntakeStore().getById(id);
    const rawRegion = draft?.profile?.address?.region;
    if (rawRegion) {
      const region = normalizeCanadianRegion(rawRegion);
      if (!region) {
        throw new ServiceError(422, 'MARKET_CLOSED', 'Please enter a valid Canadian province or territory.');
      }
      const market = await getMarketStore().get('CA');
      if (!market) throw new ServiceError(503, 'MARKET_UNAVAILABLE', 'Intake is temporarily unavailable.');
      try {
        assertIntakeOpen(market, region);
      } catch (e) {
        if (e instanceof MarketError) throw new ServiceError(422, 'MARKET_CLOSED', e.message);
        throw e;
      }
    }

    const intake = await submitIntake(getIntakeStore(), session.email, id, body.attestations, body.expectedVersion);
    // CLIO-002 kicks off on the frozen snapshot; outcome is staff-facing only.
    await startConflictCheck(intake);
    return jsonOk({ intake: toClientIntake(intake) });
  });
}
