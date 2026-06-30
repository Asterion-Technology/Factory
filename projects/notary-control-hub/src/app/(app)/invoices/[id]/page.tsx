import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/components/ui/status-badge";
import { ASSIGNMENT_TYPE_LABELS, CONTACT_TYPE_LABELS, INVOICE_STATUS_LABELS } from "@/types";
import Link from "next/link";
import { PrintButton } from "./print-button";
import { InvoiceStatusButton } from "./status-button";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, userId: user.id },
    include: {
      contact: true,
      assignment: {
        select: { id: true, type: true, borrowerName: true, appointmentAt: true, address: true },
      },
      lineItems: true,
    },
  });

  if (!invoice) notFound();

  const feeRows = [
    { label: "Signing Fee", value: invoice.fee },
    { label: "Travel Fee", value: invoice.travelFee },
    { label: "Printing Fee", value: invoice.printingFee },
    { label: "Additional Fees", value: invoice.additionalFees },
  ].filter((r) => r.value !== null && Number(r.value) !== 0);

  return (
    <>
      {/* Screen view */}
      <div className="space-y-6 max-w-3xl print:hidden">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/invoices" className="text-sm text-blue-600 hover:underline">
              ← Invoices
            </Link>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-900">
                #{invoice.invoiceNumber}
              </h1>
              <InvoiceStatusBadge status={String(invoice.status)} />
            </div>
          </div>
          <PrintButton />
        </div>

        {/* Invoice info */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-700">Invoice Details</h2>
          </div>
          <div className="px-4 py-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {invoice.contact && (
                <div>
                  <dt className="text-xs text-slate-500">Bill To</dt>
                  <dd className="mt-0.5">
                    <Link
                      href={`/contacts/${invoice.contact.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {invoice.contact.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">
                      {CONTACT_TYPE_LABELS[invoice.contact.type] ?? invoice.contact.type}
                    </span>
                  </dd>
                </div>
              )}
              {invoice.assignment && (
                <div>
                  <dt className="text-xs text-slate-500">Assignment</dt>
                  <dd className="mt-0.5">
                    <Link
                      href={`/assignments/${invoice.assignment.id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {invoice.assignment.borrowerName ??
                        ASSIGNMENT_TYPE_LABELS[invoice.assignment.type]}
                    </Link>
                    {invoice.assignment.appointmentAt && (
                      <span className="ml-2 text-xs text-slate-400">
                        {formatDateTime(invoice.assignment.appointmentAt)}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-slate-500">Issued</dt>
                <dd className="mt-0.5 text-slate-800">{formatDate(invoice.issuedAt)}</dd>
              </div>
              {invoice.dueAt && (
                <div>
                  <dt className="text-xs text-slate-500">Due</dt>
                  <dd className="mt-0.5 text-slate-800">{formatDate(invoice.dueAt)}</dd>
                </div>
              )}
              {invoice.paidAt && (
                <div>
                  <dt className="text-xs text-slate-500">Paid</dt>
                  <dd className="mt-0.5 text-slate-800">{formatDate(invoice.paidAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Fee breakdown */}
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-medium text-slate-700">Fee Breakdown</h2>
          </div>
          <div className="px-4 py-4">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {feeRows.map((r) => (
                  <tr key={r.label}>
                    <td className="py-2 text-slate-600">{r.label}</td>
                    <td className="py-2 text-right text-slate-800">{formatCurrency(r.value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200">
                  <td className="py-2 font-semibold text-slate-900">Total</td>
                  <td className="py-2 text-right font-semibold text-slate-900">
                    {formatCurrency(invoice.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Line items */}
        {invoice.lineItems.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-medium text-slate-700">Line Items</h2>
            </div>
            <div className="px-4 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 text-left text-xs font-medium text-slate-500">Description</th>
                    <th className="pb-2 text-right text-xs font-medium text-slate-500">Qty</th>
                    <th className="pb-2 text-right text-xs font-medium text-slate-500">Unit Price</th>
                    <th className="pb-2 text-right text-xs font-medium text-slate-500">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="py-2 text-slate-700">{li.description}</td>
                      <td className="py-2 text-right text-slate-600">{Number(li.quantity)}</td>
                      <td className="py-2 text-right text-slate-600">{formatCurrency(li.unitPrice)}</td>
                      <td className="py-2 text-right text-slate-800">{formatCurrency(li.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Notes */}
        {(invoice.notes || invoice.paymentNotes) && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-medium text-slate-700">Notes</h2>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm">
              {invoice.notes && (
                <div>
                  <p className="text-xs text-slate-500">Notes</p>
                  <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
              {invoice.paymentNotes && (
                <div>
                  <p className="text-xs text-slate-500">Payment Notes</p>
                  <p className="mt-0.5 text-slate-700 whitespace-pre-wrap">{invoice.paymentNotes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status transitions */}
        <div className="flex items-center gap-3">
          <InvoiceStatusButton invoiceId={id} currentStatus={String(invoice.status)} />
        </div>
      </div>

      {/* Print-only invoice layout */}
      <div className="hidden print:block text-sm text-slate-900 p-8 max-w-2xl">
        <div className="mb-8 border-b border-slate-300 pb-6">
          <h1 className="text-2xl font-bold text-slate-900">Invoice #{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-slate-500">
            Status: {INVOICE_STATUS_LABELS[String(invoice.status)] ?? invoice.status}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Bill To
            </p>
            {invoice.contact ? (
              <>
                <p className="font-semibold">{invoice.contact.name}</p>
                {invoice.contact.company && <p className="text-slate-600">{invoice.contact.company}</p>}
              </>
            ) : (
              <p className="text-slate-500">—</p>
            )}
            {invoice.assignment && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Re: Assignment
                </p>
                <p>
                  {invoice.assignment.borrowerName ??
                    ASSIGNMENT_TYPE_LABELS[invoice.assignment.type]}
                </p>
                {invoice.assignment.appointmentAt && (
                  <p className="text-slate-600">{formatDateTime(invoice.assignment.appointmentAt)}</p>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Dates
            </p>
            <p>Issued: {formatDate(invoice.issuedAt)}</p>
            {invoice.dueAt && <p>Due: {formatDate(invoice.dueAt)}</p>}
            {invoice.paidAt && <p>Paid: {formatDate(invoice.paidAt)}</p>}
          </div>
        </div>

        <table className="w-full mb-6 border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Description
              </th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {feeRows.map((r) => (
              <tr key={r.label} className="border-b border-slate-100">
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right">{formatCurrency(r.value)}</td>
              </tr>
            ))}
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-slate-100">
                <td className="py-2">
                  {li.description}
                  <span className="text-slate-500 ml-2">× {Number(li.quantity)}</span>
                </td>
                <td className="py-2 text-right">{formatCurrency(li.subtotal)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300">
              <td className="pt-3 font-bold">Total Due</td>
              <td className="pt-3 text-right font-bold text-lg">{formatCurrency(invoice.total)}</td>
            </tr>
          </tbody>
        </table>

        {invoice.paymentNotes && (
          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Payment Notes
            </p>
            <p className="whitespace-pre-wrap text-slate-700">{invoice.paymentNotes}</p>
          </div>
        )}
        {invoice.notes && (
          <div className="border-t border-slate-200 pt-4 mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Notes
            </p>
            <p className="whitespace-pre-wrap text-slate-700">{invoice.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}
