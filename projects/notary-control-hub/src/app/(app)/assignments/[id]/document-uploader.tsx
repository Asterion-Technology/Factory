"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function DocumentUploader({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/assignments/${assignmentId}/documents`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Upload failed. Check file type and size.");
        return;
      }

      setSuccess(true);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs text-slate-400">
        Allowed: PDF, JPG, PNG, TIFF, DOC, DOCX — max 25 MB
      </p>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          id="doc-upload"
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx"
          className="text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-blue-700"
        />
        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600">File uploaded successfully.</p>
      )}
    </div>
  );
}
