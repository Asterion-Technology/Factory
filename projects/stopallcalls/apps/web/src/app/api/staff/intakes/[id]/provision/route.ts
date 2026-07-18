import type { NextRequest } from 'next/server';
import { evaluateGates } from '@stopallcalls/domain';
import { provisionClioForIntake } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getClioAdapter } from '@/lib/clio';
import {
  getClioMappingStore,
  getConflictCheckStore,
  getEvidenceStore,
  getIntakeStore,
  getMatterStore,
} from '@/lib/store';

// CLIO-004..006 / WF-003/004/006: idempotent Clio provisioning behind the REAL
// gate snapshot — evidence scans and the human conflict disposition are
// evaluated from recorded facts, and the identity/retainer/payment gates stay
// PENDING until Phase 4 (RAD-6) wires their providers, so this endpoint
// cannot create matters before those gates exist. Interim admin gate as above.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const { id } = await params;
    const intake = await getIntakeStore().getById(id);
    if (!intake) return jsonError(404, 'NOT_FOUND', 'Intake not found.');

    const evidence = await getEvidenceStore().listByIntake(id);
    const check = await getConflictCheckStore().getByIntake(id);
    const gates = evaluateGates({
      evidence: { total: evidence.length, clean: evidence.filter((e) => e.scanStatus === 'CLEAN').length },
      conflictDisposition: check?.disposition ?? null,
    });

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
