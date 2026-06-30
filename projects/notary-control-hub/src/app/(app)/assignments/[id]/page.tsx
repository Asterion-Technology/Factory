import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils";
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  STATUS_TRANSITIONS,
} from "@/types";
import Link from "next/link";
import { ChecklistPanel } from "./checklist-panel";
import { StatusTransitionButton } from "./status-button";
import { DocumentUploader } from "./document-uploader";
import { StatusBadge, InvoiceStatusBadge } from "@/components/ui/status-badge";

const LOCKED_STATUSES = new Set(["CANCELLED", "PAID"]);

export default async function AssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const assignment = await prisma.assignment.findFirst({
    where: { id, userId: user.id },
    include: {
      contact: true,
      checklists: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
      documents: {
        where: { purgedAt: null },
        orderBy: { uploadedAt: "desc" },
      },
      invoice: true,
    },
  });

  if (!assignment) notFound();

  const allowedTransitions = STATUS_TRANSITIONS[assignment.status] ?? [];
  const canEdit = !LOCKED_STATUSES.has(assignment.status);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/assignments" className="text-sm text-blue-600 hover:underline">
            ← Assignments
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            {assignment.borrowerName ??
              assignment.contact?.name ??
              "Assignment"}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={assignment.status} />
            <span className="text-sm text-slate-500">
              {ASSIGNMENT_TYPE_LABELS[assignment.type]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              href={`/assignments/${id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
          {allowedTransitions.map((next) => (
            <StatusTransitionButton
              key={next}
              assignmentId={id}
              status={next}
              label={ASSIGNMENT_STATUS_LABELS[next]}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <Section title="Overview">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Borrower" value={assignment.borrowerName} />
              <Field label="Phone" value={assignment.borrowerPhone} />
              <Field label="Email" value={assignment.borrowerEmail} />
              <Field
                label="Appointment"
                value={formatDateTime(assignment.appointmentAt)}
              />
              <Field label="Address" value={assignment.address} />
              <Field
                label="Deadline"
                value={formatDate(assignment.deadlineAt)}
              />
              <Field
                label="Client / Signing Co."
                value={
                  assignment.contact?.company ??
                  assignment.contact?.name ??
                  undefined
                }
              />
              <Field
                label="Scanbacks"
                value={assignment.scanbackRequired ? "Required" : "Not required"}
              />
            </dl>
            {assignment.specialInstructions && (
              <div className="mt-4 text-sm">
                <p className="font-medium text-slate-700">Special Instructions</p>
                <p className="mt-1 text-slate-600 whitespace-pre-wrap">
                  {assignment.specialInstructions}
                </p>
              </div>
            )}
          </Section>

          {/* Checklists */}
          {assignment.checklists.length === 0 ? (
            <Section title="Checklists">
              <p className="text-sm text-slate-400">No checklists attached to this assignment.</p>
            </Section>
          ) : (
            assignment.checklists.map((cl) => (
              <ChecklistPanel key={cl.id} checklist={cl} assignmentId={id} />
            ))
          )}

          {/* Documents */}
          <Section title="Documents">
            <DocumentUploader assignmentId={id} />
            {assignment.documents.length === 0 ? (
              <p className="text-sm text-slate-400">No documents uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assignment.documents.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-slate-700">{doc.originalName}</span>
                    <div className="flex gap-3 text-xs">
                      <Link
                        href={`/api/documents/${doc.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Download
                      </Link>
                      <Link
                        href={`/documents/${doc.id}/purge`}
                        className="text-red-600 hover:underline"
                      >
                        Purge
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Fees */}
          <Section title="Fees">
            <dl className="space-y-2 text-sm">
              <FeeRow label="Signing fee" value={assignment.fee} />
              <FeeRow label="Travel fee" value={assignment.travelFee} />
              <FeeRow label="Printing fee" value={assignment.printingFee} />
              <div className="border-t border-slate-200 pt-2 flex justify-between font-medium">
                <span>Total</span>
                <span>
                  {formatCurrency(
                    (Number(assignment.fee ?? 0) +
                      Number(assignment.travelFee ?? 0) +
                      Number(assignment.printingFee ?? 0))
                  )}
                </span>
              </div>
            </dl>
          </Section>

          {/* Invoice */}
          <Section title="Invoice">
            {assignment.invoice ? (
              <div className="space-y-2 text-sm">
                <p>
                  <Link
                    href={`/invoices/${assignment.invoice.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    #{assignment.invoice.invoiceNumber}
                  </Link>
                </p>
                <InvoiceStatusBadge status={assignment.invoice.status} />
                <p className="text-slate-600">
                  {formatCurrency(assignment.invoice.total)}
                </p>
              </div>
            ) : assignment.status === "COMPLETED" ? (
              <Link
                href={`/invoices/new?assignmentId=${id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Generate invoice
              </Link>
            ) : (
              <p className="text-sm text-slate-400">
                Available after assignment is completed.
              </p>
            )}
          </Section>

          {/* Travel */}
          {(assignment.mileage || assignment.travelNotes) && (
            <Section title="Travel">
              <dl className="space-y-2 text-sm">
                {assignment.mileage && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Mileage</dt>
                    <dd>{Number(assignment.mileage).toFixed(1)} mi</dd>
                  </div>
                )}
                {assignment.travelNotes && (
                  <div>
                    <dt className="text-slate-500">Notes</dt>
                    <dd className="mt-1 text-slate-700">{assignment.travelNotes}</dd>
                  </div>
                )}
              </dl>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-medium text-slate-700">{title}</h2>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{value ?? "—"}</dd>
    </div>
  );
}

function FeeRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{formatCurrency(value as number)}</span>
    </div>
  );
}
