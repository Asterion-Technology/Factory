import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

export default async function InvoicesPage() {
  const user = await getOrCreateDbUser();

  const invoices = await prisma.invoice.findMany({
    where: { userId: user.id },
    orderBy: { issuedAt: "desc" },
    include: { contact: true, assignment: { select: { borrowerName: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <Link
          href="/invoices/new"
          className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800"
        >
          New Invoice
        </Link>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">
            No invoices yet. Complete an assignment to generate one.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Issued
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Due
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-slate-800 hover:text-blue-700"
                    >
                      #{inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {inv.contact?.name ??
                      inv.assignment?.borrowerName ??
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceStatusBadge status={String(inv.status)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(inv.issuedAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(inv.dueAt)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {formatCurrency(inv.total)}
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

