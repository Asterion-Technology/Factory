import type { NextRequest } from 'next/server';
import { provisionClioForIntake } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getClioAdapter } from '@/lib/clio';
import { computeGatesForIntake } from '@/lib/gates';
import {
  getClioMappingStore,
  getConflictCheckStore,
  getIntakeStore,
  getMatterStore,
} from '@/lib/store';

// CLIO-004..006 / WF-003/004/006: idempotent Clio provisioning behind the REAL
// gate snapshot (lib/gates.ts) — evidence scans, human conflict disposition,
// provider-verified identity, retainer evidence, and settled payments, all
// from recorded facts (PAY-006). Interim admin gate as above.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const intake = await getIntakeStore().getById(id);
    if (!intake) return jsonError(404, 'NOT_FOUND', 'Intake not found.');

    const gates = await computeGatesForIntake(id);

    const stores = {
      conflicts: getConflictCheckStore(),
      matters: getMatterStore(),
      mappings: getClioMappingStore(),
    };
    const result = await provisionClioForIntake(stores, await getClioAdapter(), intake, gates);
    return jsonOk({
      contactClioId: result.contactClioId,
      matters: result.matters.map((m) => ({
        id: m.id,
        agencyId: m.agencyId,
        displayNumber: m.displayNumber,
        state: m.state,
      })),
    });
  });
}
