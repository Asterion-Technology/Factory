import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ASSIGNMENT_STATUS_LABELS, ASSIGNMENT_TYPE_LABELS } from "@/types";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await getOrCreateDbUser();
  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const purgeWarningDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const [upcoming, needsAction, overdueInvoices, approachingPurge] =
    await Promise.all([
      prisma.assignment.findMany({
        where: {
          userId: user.id,
          appointmentAt: { gte: now, lte: in7Days },
          status: { notIn: ["CANCELLED", "PAID"] },
        },
        orderBy: { appointmentAt: "asc" },
        take: 5,
        include: { contact: true },
      }),
      prisma.assignment.findMany({
        where: {
          userId: user.id,
          status: { in: ["NEW", "DOCS_RECEIVED", "COMPLETED"] },
        },
        orderBy: { updatedAt: "asc" },
        take: 5,
        include: { contact: true },
      }),
      prisma.invoice.findMany({
        where: {
          userId: user.id,
          status: "OVERDUE",
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        include: { contact: true },
      }),
      prisma.document.findMany({
        where: {
          userId: user.id,
          expiresAt: { gte: now, lte: purgeWarningDate },
          purgedAt: null,
        },
        orderBy: { expiresAt: "asc" },
        take: 5,
      }),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardCard
          title="Upcoming Appointments"
          emptyMessage="No appointments in the next 7 days"
          viewAllHref="/assignments"
        >
          {upcoming.map((a) => (
            <DashboardRow
              key={a.id}
              href={`/assignments/${a.id}`}
              primary={a.borrowerName ?? a.contact?.name ?? "—"}
              secondary={ASSIGNMENT_TYPE_LABELS[a.type]}
              meta={formatDateTime(a.appointmentAt)}
            />
          ))}
        </DashboardCard>

        <DashboardCard
          title="Needs Action"
          emptyMessage="No assignments needing action"
          viewAllHref="/assignments"
        >
          {needsAction.map((a) => (
            <DashboardRow
              key={a.id}
              href={`/assignments/${a.id}`}
              primary={a.borrowerName ?? a.contact?.name ?? "—"}
              secondary={ASSIGNMENT_STATUS_LABELS[a.status]}
              meta={ASSIGNMENT_TYPE_LABELS[a.type]}
            />
          ))}
        </DashboardCard>

        <DashboardCard
          title="Overdue Invoices"
          emptyMessage="No overdue invoices"
          viewAllHref="/invoices"
        >
          {overdueInvoices.map((inv) => (
            <DashboardRow
              key={inv.id}
              href={`/invoices/${inv.id}`}
              primary={inv.contact?.name ?? "—"}
              secondary={`#${inv.invoiceNumber}`}
              meta={formatCurrency(inv.total)}
            />
          ))}
        </DashboardCard>

        <DashboardCard
          title="Documents Approaching Purge"
          emptyMessage="No documents nearing purge date"
          viewAllHref="/documents"
        >
          {approachingPurge.map((doc) => (
            <DashboardRow
              key={doc.id}
              href={`/documents`}
              primary={doc.originalName}
              secondary="Expires soon"
              meta={formatDateTime(doc.expiresAt)}
            />
          ))}
        </DashboardCard>
      </div>

      <p className="text-xs text-slate-400">
        ⚠ This tool helps organize notary workflow. It does not provide legal
        advice. Always follow your state notary laws and verify signer identity
        according to applicable rules.
      </p>
    </div>
  );
}

function DashboardCard({
  title,
  children,
  emptyMessage,
  viewAllHref,
}: {
  title: string;
  children: React.ReactNode;
  emptyMessage: string;
  viewAllHref: string;
}) {
  const hasChildren =
    Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-700">{title}</h2>
        <Link
          href={viewAllHref}
          className="text-xs text-blue-600 hover:underline"
        >
          View all
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {hasChildren ? (
          children
        ) : (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardRow({
  href,
  primary,
  secondary,
  meta,
}: {
  href: string;
  primary: string;
  secondary: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50"
    >
      <div>
        <p className="font-medium text-slate-800">{primary}</p>
        <p className="text-xs text-slate-500">{secondary}</p>
      </div>
      <span className="text-xs text-slate-400">{meta}</span>
    </Link>
  );
}
