"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ASSIGNMENT_TYPE_LABELS } from "@/types";

interface Contact {
  id: string;
  name: string;
  company: string | null;
  type: string;
}

export function NewAssignmentForm({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      type: form.get("type"),
      contactId: form.get("contactId") || undefined,
      borrowerName: form.get("borrowerName") || undefined,
      borrowerPhone: form.get("borrowerPhone") || undefined,
      borrowerEmail: form.get("borrowerEmail") || undefined,
      appointmentAt: form.get("appointmentAt")
        ? new Date(form.get("appointmentAt") as string).toISOString()
        : undefined,
      address: form.get("address") || undefined,
      fee: form.get("fee") ? Number(form.get("fee")) : undefined,
      travelFee: form.get("travelFee") ? Number(form.get("travelFee")) : undefined,
      printingFee: form.get("printingFee") ? Number(form.get("printingFee")) : undefined,
      specialInstructions: form.get("specialInstructions") || undefined,
      scanbackRequired: form.get("scanbackRequired") === "on",
    };

    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create assignment");
        return;
      }

      const { id } = await res.json();
      router.push(`/assignments/${id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-6 space-y-5"
    >
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
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            maxLength={20}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          maxLength={320}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            maxLength={500}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            min="0"
            max="99999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            min="0"
            max="9999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            min="0"
            max="9999"
            step="0.01"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          rows={3}
          maxLength={2000}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="scanbackRequired"
          name="scanbackRequired"
          className="h-4 w-4 rounded border-slate-300 text-blue-600"
        />
        <label className="text-sm text-slate-700" htmlFor="scanbackRequired">
          Scanbacks required
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link
          href="/assignments"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create Assignment"}
        </button>
      </div>
    </form>
  );
}
