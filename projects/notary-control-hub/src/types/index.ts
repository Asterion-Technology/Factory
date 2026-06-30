export type {
  User,
  Contact,
  Assignment,
  AssignmentChecklist,
  AssignmentChecklistItem,
  Document,
  PurgeAttestation,
  Invoice,
  InvoiceLineItem,
  CommunicationLog,
  AuditLog,
  ContactType,
  AssignmentType,
  AssignmentStatus,
  ChecklistTemplateType,
  InvoiceStatus,
  CommunicationChannel,
  CommunicationDirection,
} from "@prisma/client";

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONFIRMED: "Confirmed",
  DOCS_RECEIVED: "Docs Received",
  PRINTED: "Printed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  GENERAL: "General Notary",
  LOAN_SIGNING: "Loan Signing (NSA)",
  RON: "Remote Online Notary",
  MOBILE: "Mobile Notary",
};

export const CONTACT_TYPE_LABELS: Record<string, string> = {
  SIGNING_CO: "Signing Company",
  TITLE: "Title Company",
  ESCROW: "Escrow",
  CLIENT: "Direct Client",
  BORROWER: "Borrower / Signer",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["DOCS_RECEIVED", "CANCELLED"],
  DOCS_RECEIVED: ["PRINTED", "CANCELLED"],
  PRINTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["INVOICED"],
  INVOICED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};
