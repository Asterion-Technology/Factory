"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const dangerStatuses = new Set(["CANCELLED"]);

export function StatusTransitionButton({
  assignmentId,
  status,
  label,
}: {
  assignmentId: string;
  status: string;
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (status === "CANCELLED") {
      if (!confirm("Cancel this assignment? This cannot be undone.")) return;
    }
    setLoading(true);
    try {
      await fetch(`/api/assignments/${assignmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const isDanger = dangerStatuses.has(status);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
        isDanger
          ? "border border-red-300 text-red-600 hover:bg-red-50"
          : "bg-blue-700 text-white hover:bg-blue-800"
      }`}
    >
      {loading ? "…" : label}
    </button>
  );
}
