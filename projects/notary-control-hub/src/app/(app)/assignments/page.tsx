import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatCurrency } from "@/lib/utils";
import { ASSIGNMENT_TYPE_LABELS } from "@/types";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function AssignmentsPage() {
  const user = await getOrCreateDbUser();

  const assignments = await prisma.assignment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { contact: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Assignments</h1>
        <Link
          href="/assignments/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          New Assignment
        </Link>
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">No assignments yet.</p>
          <Link
            href="/assignments/new"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Create your first assignment
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Borrower / Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Appointment
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Fee
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/assignments/${a.id}`}
                      className="font-medium text-slate-800 hover:text-blue-700"
                    >
                      {a.borrowerName ?? a.contact?.name ?? "—"}
                    </Link>
                    {a.contact && (
                      <p className="text-xs text-slate-400">
                        {a.contact.company ?? a.contact.name}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {ASSIGNMENT_TYPE_LABELS[a.type]}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={String(a.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDateTime(a.appointmentAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatCurrency(a.fee)}
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

