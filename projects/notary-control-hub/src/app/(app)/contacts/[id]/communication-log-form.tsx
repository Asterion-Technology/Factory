"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  SMS: "SMS",
  IN_PERSON: "In Person",
};

const DIRECTION_LABELS: Record<string, string> = {
  IN: "Inbound",
  OUT: "Outbound",
};

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CommunicationLogForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const occurredRaw = form.get("occurredAt") as string;

    const body = {
      channel: form.get("channel"),
      direction: form.get("direction"),
      summary: form.get("summary"),
      occurredAt: occurredRaw ? new Date(occurredRaw).toISOString() : new Date().toISOString(),
    };

    try {
      const res = await fetch(`/api/contacts/${contactId}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to log communication");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 hover:underline"
      >
        + Log communication
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
    >
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="channel">
            Channel
          </label>
          <select
            id="channel"
            name="channel"
            required
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(CHANNEL_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600" htmlFor="direction">
            Direction
          </label>
          <select
            id="direction"
            name="direction"
            required
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(DIRECTION_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="occurredAt">
          Date & Time
        </label>
        <input
          type="datetime-local"
          id="occurredAt"
          name="occurredAt"
          required
          defaultValue={nowLocal()}
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600" htmlFor="summary">
          Summary *
        </label>
        <textarea
          id="summary"
          name="summary"
          required
          rows={2}
          maxLength={2000}
          placeholder="Brief description of the communication"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
