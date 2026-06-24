import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import {
  CONTACT_TYPE_LABELS,
  ASSIGNMENT_TYPE_LABELS,
} from "@/types";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { CommunicationLogForm } from "./communication-log-form";

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: "Email",
  PHONE: "Phone",
  SMS: "SMS",
  IN_PERSON: "In Person",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, userId: user.id },
    include: {
      assignments: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      communicationLogs: {
        orderBy: { occurredAt: "desc" },
        take: 20,
      },
    },
  });

  if (!contact) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/contacts" className="text-sm text-blue-600 hover:underline">
            ← Contacts
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {contact.name}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {CONTACT_TYPE_LABELS[contact.type]}
            </span>
            {contact.company && (
              <span className="text-sm text-slate-500">{contact.company}</span>
            )}
          </div>
        </div>
        <Link
          href={`/contacts/${id}/edit`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
      </div>

      {/* Contact info */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">Contact Info</h2>
        </div>
        <div className="px-4 py-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {contact.email && (
              <div>
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="mt-0.5">
                  <a href={`mailto:${contact.email}`} className="text-blue-700 hover:underline">
                    {contact.email}
                  </a>
                </dd>
              </div>
            )}
            {contact.phone && (
              <div>
                <dt className="text-xs text-slate-500">Phone</dt>
                <dd className="mt-0.5 text-slate-800">{contact.phone}</dd>
              </div>
            )}
            {contact.address && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Address</dt>
                <dd className="mt-0.5 text-slate-800 whitespace-pre-line">{contact.address}</dd>
              </div>
            )}
            {contact.paymentTerms && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Payment Terms</dt>
                <dd className="mt-0.5 text-slate-800">{contact.paymentTerms}</dd>
              </div>
            )}
            {contact.preferredInstructions && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Preferred Instructions</dt>
                <dd className="mt-0.5 text-slate-800 whitespace-pre-wrap">
                  {contact.preferredInstructions}
                </dd>
              </div>
            )}
            {contact.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-slate-500">Notes</dt>
                <dd className="mt-0.5 text-slate-800 whitespace-pre-wrap">{contact.notes}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Assignment history */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">
            Assignment History
          </h2>
        </div>
        <div className="px-4 py-4">
          {contact.assignments.length === 0 ? (
            <p className="text-sm text-slate-400">No assignments yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-xs font-medium text-slate-500">Borrower</th>
                  <th className="pb-2 text-left text-xs font-medium text-slate-500">Type</th>
                  <th className="pb-2 text-left text-xs font-medium text-slate-500">Status</th>
                  <th className="pb-2 text-left text-xs font-medium text-slate-500">Appointment</th>
                  <th className="pb-2 text-right text-xs font-medium text-slate-500">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contact.assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2">
                      <Link
                        href={`/assignments/${a.id}`}
                        className="font-medium text-slate-800 hover:text-blue-700"
                      >
                        {a.borrowerName ?? "—"}
                      </Link>
                    </td>
                    <td className="py-2 text-slate-600">
                      {ASSIGNMENT_TYPE_LABELS[a.type]}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={String(a.status)} />
                    </td>
                    <td className="py-2 text-slate-600">
                      {formatDateTime(a.appointmentAt)}
                    </td>
                    <td className="py-2 text-right text-slate-600">
                      {formatCurrency(a.fee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Communication log */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-medium text-slate-700">Communication Log</h2>
        </div>
        <div className="px-4 py-4 space-y-3">
          <CommunicationLogForm contactId={id} />
          {contact.communicationLogs.length === 0 ? (
            <p className="text-sm text-slate-400">No communications logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {contact.communicationLogs.map((log) => (
                <li key={log.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">
                        {CHANNEL_LABELS[log.channel] ?? log.channel}
                      </span>
                      <span className="text-xs text-slate-400">
                        {log.direction === "IN" ? "↙ Inbound" : "↗ Outbound"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {formatDate(log.occurredAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{log.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
