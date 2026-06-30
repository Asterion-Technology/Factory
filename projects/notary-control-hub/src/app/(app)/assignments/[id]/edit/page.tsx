import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { EditAssignmentForm } from "./form";

export default async function EditAssignmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const assignment = await prisma.assignment.findFirst({
    where: { id, userId: user.id },
    include: { contact: true },
  });

  if (!assignment) notFound();

  const contacts = await prisma.contact.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true, company: true, type: true },
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <a
          href={`/assignments/${id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Assignment
        </a>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Edit Assignment
        </h1>
      </div>
      <EditAssignmentForm assignment={assignment} contacts={contacts} />
    </div>
  );
}
