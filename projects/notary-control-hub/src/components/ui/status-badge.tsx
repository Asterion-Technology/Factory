import { ASSIGNMENT_STATUS_LABELS, INVOICE_STATUS_LABELS } from "@/types";

const ASSIGNMENT_COLORS: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  DOCS_RECEIVED: "bg-yellow-100 text-yellow-700",
  PRINTED: "bg-orange-100 text-orange-700",
  IN_PROGRESS: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  INVOICED: "bg-teal-100 text-teal-700",
  PAID: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const INVOICE_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ASSIGNMENT_COLORS[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {ASSIGNMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${INVOICE_COLORS[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {INVOICE_STATUS_LABELS[status] ?? status}
    </span>
  );
}
