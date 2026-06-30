import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewAssignmentForm } from "./form";

export default async function NewAssignmentPage() {
  const user = await getOrCreateDbUser();

  const contacts = await prisma.contact.findMany({
    where: {
      userId: user.id,
      type: { in: ["SIGNING_CO", "TITLE", "ESCROW", "CLIENT"] },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, company: true, type: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">New Assignment</h1>
      <NewAssignmentForm contacts={contacts} />
    </div>
  );
}
