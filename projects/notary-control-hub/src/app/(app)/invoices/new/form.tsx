"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CONTACT_TYPE_LABELS, ASSIGNMENT_TYPE_LABELS } from "@/types";
import { formatDateTime } from "@/lib/utils";

type Contact = { id: string; name: string; type: string; company: string | null; paymentTerms: string | null };
type Assignment = {
  id: string;
  borrowerName: string | null;
  appointmentAt: Date | null;
  type: string;
  fee: unknown;
};
type LineItem = { _key: string; description: string; quantity: string; unitPrice: string; subtotal: string };

function newLineItem(): LineItem {
  return { _key: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "0", subtotal: "0" };
}

function parseDays(paymentTerms: string | null): number | null {
  if (!paymentTerms) return null;
  const m = paymentTerms.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function addDaysToDate(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function NewInvoiceForm({
  contacts,
  assignments,
}: {
  contacts: Contact[];
  assignments: Assignment[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [fee, setFee] = useState("");
  const [travelFee, setTravelFee] = useState("");
  const [printingFee, setPrintingFee] = useState("");
  const [additionalFees, setAdditionalFees] = useState("");
  const [total, setTotal] = useState("0.00");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");

  function computeDueDate(contactId: string, assignmentId: string) {
    const contact = contacts.find((c) => c.id === contactId);
    const days = parseDays(contact?.paymentTerms ?? null);
    if (!days) { setDueAt(""); return; }
    const assignment = assignments.find((a) => a.id === assignmentId);
    const base = assignment?.appointmentAt ? new Date(assignment.appointmentAt) : new Date();
    setDueAt(addDaysToDate(base, days));
  }

  function handleContactChange(contactId: string) {
    setSelectedContactId(contactId);
    computeDueDate(contactId, selectedAssignmentId);
  }

  function handleAssignmentChange(assignmentId: string) {
    setSelectedAssignmentId(assignmentId);
    computeDueDate(selectedContactId, assignmentId);
  }

  const recalcTotal = useCallback(
    (f: string, t: string, p: string, a: string, items: LineItem[]) => {
      const sum =
        (parseFloat(f) || 0) +
        (parseFloat(t) || 0) +
        (parseFloat(p) || 0) +
        (parseFloat(a) || 0) +
        items.reduce((s, li) => s + (parseFloat(li.subtotal) || 0), 0);
      setTotal(sum.toFixed(2));
    },
    []
  );

  function handleFeeChange(setter: (v: string) => void, value: string) {
    setter(value);
    recalcTotal(
      setter === setFee ? value : fee,
      setter === setTravelFee ? value : travelFee,
      setter === setPrintingFee ? value : printingFee,
      setter === setAdditionalFees ? value : additionalFees,
      lineItems
    );
  }

  function updateLineItem(key: string, field: keyof LineItem, value: string) {
    setLineItems((prev) => {
      const updated = prev.map((li) => {
        if (li._key !== key) return li;
        const next = { ...li, [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          const qty = parseFloat(field === "quantity" ? value : li.quantity) || 0;
          const price = parseFloat(field === "unitPrice" ? value : li.unitPrice) || 0;
          next.subtotal = (qty * price).toFixed(2);
        }
        return next;
      });
      recalcTotal(fee, travelFee, printingFee, additionalFees, updated);
      return updated;
    });
  }

  function addLineItem() {
    const item = newLineItem();
    setLineItems((prev) => {
      const next = [...prev, item];
      recalcTotal(fee, travelFee, printingFee, additionalFees, next);
      return next;
    });
  }

  function removeLineItem(key: string) {
    setLineItems((prev) => {
      const next = prev.filter((li) => li._key !== key);
      recalcTotal(fee, travelFee, printingFee, additionalFees, next);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    const body: Record<string, unknown> = {
      total: parseFloat(total) || 0,
      contactId: selectedContactId || undefined,
      assignmentId: selectedAssignmentId || undefined,
      fee: parseFloat(fee) || undefined,
      travelFee: parseFloat(travelFee) || undefined,
      printingFee: parseFloat(printingFee) || undefined,
      additionalFees: parseFloat(additionalFees) || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      notes: (form.get("notes") as string) || undefined,
      paymentNotes: (form.get("paymentNotes") as string) || undefined,
    };

    // strip undefined keys
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    if (lineItems.length > 0) {
      body.lineItems = lineItems.map((li) => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: parseFloat(li.unitPrice) || 0,
        subtotal: parseFloat(li.subtotal) || 0,
      }));
    }

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create invoice");
        return;
      }

      const { id } = await res.json();
      router.push(`/invoices/${id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-6"
    >
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Contact + Assignment */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="contactId">
            Contact
          </label>
          <select
            id="contactId"
            name="contactId"
            value={selectedContactId}
            onChange={(e) => handleContactChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— None —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({CONTACT_TYPE_LABELS[c.type] ?? c.type})
                {c.paymentTerms ? ` · ${c.paymentTerms}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="assignmentId">
            Assignment (COMPLETED, no invoice)
          </label>
          <select
            id="assignmentId"
            name="assignmentId"
            value={selectedAssignmentId}
            onChange={(e) => handleAssignmentChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— None —</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.borrowerName ?? ASSIGNMENT_TYPE_LABELS[a.type]} —{" "}
                {formatDateTime(a.appointmentAt)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Fee fields */}
      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-3">Fees</h2>
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              { label: "Signing Fee", value: fee, setter: setFee },
              { label: "Travel Fee", value: travelFee, setter: setTravelFee },
              { label: "Printing Fee", value: printingFee, setter: setPrintingFee },
              { label: "Additional Fees", value: additionalFees, setter: setAdditionalFees },
            ] as const
          ).map(({ label, value, setter }) => (
            <div key={label}>
              <label className="block text-sm font-medium text-slate-700">{label}</label>
              <div className="mt-1 flex items-center">
                <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={value}
                  onChange={(e) => handleFeeChange(setter, e.target.value)}
                  className="block h-9 w-full rounded-r-md border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic line items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-slate-700">Line Items (optional)</h2>
          <button
            type="button"
            onClick={addLineItem}
            className="text-xs text-blue-600 hover:underline"
          >
            + Add line item
          </button>
        </div>
        {lineItems.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_70px_90px_80px_24px] gap-2 text-xs text-slate-500 px-1">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit Price</span>
              <span>Subtotal</span>
              <span />
            </div>
            {lineItems.map((li) => (
              <div key={li._key} className="grid grid-cols-[1fr_70px_90px_80px_24px] gap-2 items-center">
                <input
                  type="text"
                  value={li.description}
                  onChange={(e) => updateLineItem(li._key, "description", e.target.value)}
                  placeholder="Description"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={li.quantity}
                  onChange={(e) => updateLineItem(li._key, "quantity", e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={li.unitPrice}
                  onChange={(e) => updateLineItem(li._key, "unitPrice", e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">${parseFloat(li.subtotal).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => removeLineItem(li._key)}
                  className="text-slate-400 hover:text-red-500 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total */}
      <div className="flex items-center gap-4 border-t border-slate-100 pt-4">
        <label className="text-sm font-semibold text-slate-700 w-24" htmlFor="total">
          Total *
        </label>
        <div className="flex items-center">
          <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-500">
            $
          </span>
          <input
            type="number"
            id="total"
            name="total"
            required
            step="0.01"
            min="0"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="block h-9 w-40 rounded-r-md border border-slate-300 px-3 text-sm font-semibold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Due date + notes */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="dueAt">
            Due Date
            {dueAt && (
              <span className="ml-2 text-xs font-normal text-blue-600">
                auto-calculated from payment terms
              </span>
            )}
          </label>
          <input
            type="date"
            id="dueAt"
            name="dueAt"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="paymentNotes">
          Payment Notes
        </label>
        <textarea
          id="paymentNotes"
          name="paymentNotes"
          rows={2}
          maxLength={2000}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <a
          href="/invoices"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}
