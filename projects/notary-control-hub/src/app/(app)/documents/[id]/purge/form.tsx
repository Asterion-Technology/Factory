"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PurgeForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [attested, setAttested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePurge() {
    if (!attested) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attested: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Purge failed");
        return;
      }

      router.push("/documents");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
        />
        <span className="text-sm text-slate-700">
          I attest that I have reviewed and am authorizing the permanent deletion
          of this document. I confirm that all client records related to this
          file have been securely disposed of in accordance with applicable
          notary laws and data retention requirements.
        </span>
      </label>

      <div className="flex gap-3">
        <a
          href="/documents"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </a>
        <button
          onClick={handlePurge}
          disabled={!attested || loading}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? "Purging…" : "Confirm Purge"}
        </button>
      </div>
    </div>
  );
}
