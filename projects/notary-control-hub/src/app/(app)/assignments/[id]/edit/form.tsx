"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNMENT_TYPE_LABELS, ASSIGNMENT_STATUS_LABELS } from "@/types";
import type { Assignment, Contact } from "@/types";

interface Props {
  assignment: Assignment & { contact: Contact | null };
  contacts: Pick<Contact, "id" | "name" | "company" | "type">[];
}

const LOCKED_STATUSES = new Set(["CANCELLED", "PAID"]);

export function EditAssignmentForm({ assignment, contacts }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLocked = LOCKED_STATUSES.has(assignment.status);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLocked) return;
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    const appointmentRaw = form.get("appointmentAt") as string;
    const body = {
      type: form.get("type"),
      contactId: form.get("contactId") || undefined,
      borrowerName: form.get("borrowerName") || undefined,
      borrowerPhone: form.get("borrowerPhone") || undefined,
      borrowerEmail: form.get("borrowerEmail") || undefined,
      appointmentAt: appointmentRaw
        ? new Date(appointmentRaw).toISOString()
        : undefined,
      address: form.get("address") || undefined,
      fee: form.get("fee") ? Number(form.get("fee")) : undefined,
      travelFee: form.get("travelFee") ? Number(form.get("travelFee")) : undefined,
      printingFee: form.get("printingFee") ? Number(form.get("printingFee")) : undefined,
      specialInstructions: form.get("specialInstructions") || undefined,
      scanbackRequired: form.get("scanbackRequired") === "on",
    };

    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save changes");
        return;
      }

      router.push(`/assignments/${assignment.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Format a Date for datetime-local input value
  function toDatetimeLocal(d: Date | null | undefined): string {
    if (!d) return "";
    const dt = new Date(d);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
      {isLocked && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This assignment cannot be edited because it is in{" "}
          <strong>{ASSIGNMENT_STATUS_LABELS[assignment.status]}</strong> status.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="type">
          Assignment Type *
        </label>
        <select
          id="type"
          name="type"
          required
          disabled={isLocked}
          defaultValue={assignment.type}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="contactId">
          Signing Company / Client
        </label>
        <select
          id="contactId"
          name="contactId"
          disabled={isLocked}
          defaultValue={assignment.contactId ?? ""}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">None</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company ? `${c.company} — ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="borrowerName">
            Borrower / Signer Name
          </label>
          <input
            type="text"
            id="borrowerName"
            name="borrowerName"
            disabled={isLocked}
            defaultValue={assignment.borrowerName ?? ""}
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="borrowerPhone">
            Borrower Phone
          </label>
          <input
            type="tel"
            id="borrowerPhone"
            name="borrowerPhone"
            disabled={isLocked}
            defaultValue={assignment.borrowerPhone ?? ""}
            maxLength={20}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="borrowerEmail">
          Borrower Email
        </label>
        <input
          type="email"
          id="borrowerEmail"
          name="borrowerEmail"
          disabled={isLocked}
          defaultValue={assignment.borrowerEmail ?? ""}
          maxLength={320}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="appointmentAt">
            Appointment Date & Time
          </label>
          <input
            type="datetime-local"
            id="appointmentAt"
            name="appointmentAt"
            disabled={isLocked}
            defaultValue={toDatetimeLocal(assignment.appointmentAt)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="address">
            Location / Address
          </label>
          <input
            type="text"
            id="address"
            name="address"
            disabled={isLocked}
            defaultValue={assignment.address ?? ""}
            maxLength={500}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="fee">
            Fee ($)
          </label>
          <input
            type="number"
            id="fee"
            name="fee"
            disabled={isLocked}
            defaultValue={assignment.fee !== null ? String(assignment.fee) : ""}
            min="0"
            max="99999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="travelFee">
            Travel Fee ($)
          </label>
          <input
            type="number"
            id="travelFee"
            name="travelFee"
            disabled={isLocked}
            defaultValue={assignment.travelFee !== null ? String(assignment.travelFee) : ""}
            min="0"
            max="9999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="printingFee">
            Print Fee ($)
          </label>
          <input
            type="number"
            id="printingFee"
            name="printingFee"
            disabled={isLocked}
            defaultValue={assignment.printingFee !== null ? String(assignment.printingFee) : ""}
            min="0"
            max="9999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>

      <div>
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="specialInstructions"
        >
          Special Instructions
        </label>
        <textarea
          id="specialInstructions"
          name="specialInstructions"
          disabled={isLocked}
          defaultValue={assignment.specialInstructions ?? ""}
          rows={3}
          maxLength={2000}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="scanbackRequired"
          name="scanbackRequired"
          disabled={isLocked}
          defaultChecked={assignment.scanbackRequired}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
        />
        <label className="text-sm text-slate-700" htmlFor="scanbackRequired">
          Scanbacks required
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <a
          href={`/assignments/${assignment.id}`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>
        {!isLocked && (
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>
    </form>
  );
}
