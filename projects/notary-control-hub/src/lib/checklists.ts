import type { ChecklistTemplateType } from "@prisma/client";

export const CHECKLIST_TEMPLATES: Record<ChecklistTemplateType, string[]> = {
  GENERAL: [
    "Confirm signer identity requirements",
    "Confirm document type",
    "Confirm venue/location",
    "Bring journal, stamp, ID, and pens",
    "Verify signer willingness and awareness",
    "Complete certificate correctly",
    "Record journal entry",
    "Collect payment",
    "Securely store or dispose of temporary files",
  ],
  NSA: [
    "Confirm assignment details with signing company",
    "Confirm appointment with borrower",
    "Confirm document package received",
    "Review special instructions",
    "Print documents correctly (correct pages, order, duplex if required)",
    "Prepare return shipping label",
    "Bring all notary supplies",
    "Verify borrower IDs at signing",
    "Complete signing with borrower",
    "Complete scanbacks if required",
    "Drop return package at carrier",
    "Mark assignment complete",
    "Generate and send invoice to signing company",
  ],
  PREFLIGHT: [
    "Appointment confirmed with borrower",
    "Address verified (Google Maps or similar)",
    "Signer names verified against documents",
    "ID requirements reviewed",
    "Document package received",
    "Documents printed and reviewed",
    "FedEx/UPS drop location identified",
    "Notary supplies packed (stamp, journal, pens)",
    "Travel time estimated",
    "Payment terms confirmed with signing company",
  ],
  RON: [
    "Confirm remote online notarization platform credentials",
    "Confirm borrower has compatible device and internet",
    "Send borrower pre-session instructions",
    "Verify identity documents via RON platform",
    "Test audio/video connection before session",
    "Record session per platform requirements",
    "Complete all e-signatures and notarial acts",
    "Confirm documents stored on platform",
    "Generate and send invoice",
    "Retain session recording per state law requirements",
  ],
};

export function getChecklistTemplateLabel(type: ChecklistTemplateType): string {
  const labels: Record<ChecklistTemplateType, string> = {
    GENERAL: "General Notary",
    NSA: "NSA Signing",
    PREFLIGHT: "Pre-Flight",
    RON: "Remote Online Notarization",
  };
  return labels[type];
}

export function getDefaultChecklistsForAssignmentType(
  assignmentType: string
): ChecklistTemplateType[] {
  switch (assignmentType) {
    case "LOAN_SIGNING":
      return ["PREFLIGHT", "NSA"];
    case "RON":
      return ["RON"];
    case "MOBILE":
      return ["PREFLIGHT", "GENERAL"];
    default:
      return ["GENERAL"];
  }
}
