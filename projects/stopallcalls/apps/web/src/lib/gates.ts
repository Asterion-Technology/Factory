import {
  evaluateGates,
  type GateSnapshot,
} from '@stopallcalls/domain';
import {
  identityGateFromRecord,
  legalApprovalGateForMatter,
  paymentGateFromRecords,
  retainerGateFromRecord,
  type MatterRecord,
} from '@stopallcalls/db';
import {
  getApprovalStore,
  getConflictCheckStore,
  getEvidenceStore,
  getIdentityStore,
  getLetterVersionStore,
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

/** Matter-scoped snapshot: intake gates + LEGAL_APPROVAL from the letter's
 * hash-bound approval (Phase 5). This is what letter sending enforces. */
export async function computeGatesForMatter(matter: MatterRecord): Promise<GateSnapshot> {
  const base = await computeGatesForIntake(matter.intakeId);
  const legal = await legalApprovalGateForMatter(
    { versions: getLetterVersionStore(), approvals: getApprovalStore() },
    matter.id,
  );
  return { ...base, LEGAL_APPROVAL: { gate: 'LEGAL_APPROVAL', status: legal } };
}
