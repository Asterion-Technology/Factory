import {
  evaluateGates,
  type GateSnapshot,
} from '@stopallcalls/domain';
import {
  identityGateFromRecord,
  paymentGateFromRecords,
  retainerGateFromRecord,
} from '@stopallcalls/db';
import {
  getConflictCheckStore,
  getEvidenceStore,
  getIdentityStore,
  getOrderStore,
  getPaymentStore,
  getRetainerSignatureStore,
} from '@/lib/store';

/**
 * The real gate snapshot (SRS §1.2), computed from recorded facts only —
 * evidence scan results, the human conflict disposition, provider-verified
 * identity, recorded retainer evidence, and settled payments. Never UI state.
 * LEGAL_APPROVAL stays PENDING until Phase 5 lawyer approval exists.
 */
export async function computeGatesForIntake(intakeId: string): Promise<GateSnapshot> {
  const evidence = await getEvidenceStore().listByIntake(intakeId);
  const conflict = await getConflictCheckStore().getByIntake(intakeId);
  const identity = await getIdentityStore().getByIntake(intakeId);
  const signature = await getRetainerSignatureStore().getByIntake(intakeId);
  const order = await getOrderStore().getByIntake(intakeId);
  const payments = order ? await getPaymentStore().listByOrder(order.id) : [];
  return evaluateGates({
    evidence: { total: evidence.length, clean: evidence.filter((e) => e.scanStatus === 'CLEAN').length },
    conflictDisposition: conflict?.disposition ?? null,
    identity: identityGateFromRecord(identity),
    retainer: retainerGateFromRecord(signature),
    payment: paymentGateFromRecords(payments),
  });
}
