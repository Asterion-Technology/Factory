import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function DocumentsPage() {
  const user = await getOrCreateDbUser();
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const documents = await prisma.document.findMany({
    where: { userId: user.id, purgedAt: null },
    orderBy: { uploadedAt: "desc" },
    include: { assignment: { select: { id: true, borrowerName: true } } },
  });

  const approaching = documents.filter(
    (d) => d.expiresAt && d.expiresAt <= in3Days
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
      </div>

      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        ⚠ Sensitive documents should only be retained as long as legally
        required. Purge client records promptly after assignment completion.
        This tool will never expose your files publicly.
      </div>

      {approaching.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm font-medium text-orange-800">
            {approaching.length} document{approaching.length !== 1 ? "s" : ""}{" "}
            approaching purge date
          </p>
          <ul className="mt-2 space-y-1">
            {approaching.map((d) => (
              <li key={d.id} className="text-sm text-orange-700">
                {d.originalName} — expires {formatDateTime(d.expiresAt)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">
            No documents. Upload files from an assignment page.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  File
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Assignment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Uploaded
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Expires
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {doc.originalName}
                    <span className="ml-2 text-xs text-slate-400">
                      {(doc.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {doc.assignment ? (
                      <Link
                        href={`/assignments/${doc.assignment.id}`}
                        className="hover:text-blue-700"
                      >
                        {doc.assignment.borrowerName ?? "Assignment"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(doc.uploadedAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {doc.expiresAt ? (
                      <span
                        className={
                          doc.expiresAt <= in3Days
                            ? "font-medium text-orange-600"
                            : ""
                        }
                      >
                        {formatDateTime(doc.expiresAt)}
                      </span>
                    ) : (
                      "No expiry set"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/api/documents/${doc.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Download
                    </Link>
                    <span className="mx-2 text-slate-300">|</span>
                    <Link
                      href={`/documents/${doc.id}/purge`}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Purge
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
