"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["PAID", "OVERDUE", "CANCELLED"],
  OVERDUE: ["PAID"],
  PAID: [],
  CANCELLED: [],
};

const LABELS: Record<string, string> = {
  SENT: "Mark as Sent",
  PAID: "Mark as Paid",
  OVERDUE: "Mark as Overdue",
  CANCELLED: "Cancel Invoice",
};

export function InvoiceStatusButton({
  invoiceId,
  currentStatus,
}: {
  invoiceId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const nextStatuses = TRANSITIONS[currentStatus] ?? [];
  if (nextStatuses.length === 0) return null;

  async function handleTransition(status: string) {
    if (status === "CANCELLED") {
      if (!confirm("Cancel this invoice? This cannot be undone.")) return;
    }
    setLoading(status);
    try {
      await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex gap-2 flex-wrap print:hidden">
      {nextStatuses.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => handleTransition(status)}
          disabled={loading !== null}
          className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            status === "CANCELLED"
              ? "border border-red-300 text-red-600 hover:bg-red-50"
              : "bg-blue-700 text-white hover:bg-blue-800"
          }`}
        >
          {loading === status ? "…" : (LABELS[status] ?? status)}
        </button>
      ))}
    </div>
  );
}
