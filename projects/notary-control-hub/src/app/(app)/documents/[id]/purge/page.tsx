import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PurgeForm } from "./form";
import { formatDateTime } from "@/lib/utils";

export default async function PurgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: user.id, purgedAt: null },
    include: { assignment: { select: { id: true, borrowerName: true } } },
  });

  if (!doc) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Purge Document</h1>

      <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">File</dt>
            <dd className="font-medium text-slate-800">{doc.originalName}</dd>
          </div>
          {doc.assignment && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Assignment</dt>
              <dd className="text-slate-800">
                {doc.assignment.borrowerName ?? "Assignment"}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-slate-500">Uploaded</dt>
            <dd className="text-slate-800">{formatDateTime(doc.uploadedAt)}</dd>
          </div>
          {doc.expiresAt && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Expires</dt>
              <dd className="text-slate-800">{formatDateTime(doc.expiresAt)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
        <p className="font-medium">This action is permanent.</p>
        <p className="mt-1">
          The file will be permanently deleted from storage. A purge attestation
          will be recorded confirming that all client records related to this
          document have been securely disposed of.
        </p>
      </div>

      <PurgeForm documentId={doc.id} />
    </div>
  );
}
