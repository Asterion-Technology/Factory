import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { EditContactForm } from "./form";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getOrCreateDbUser();
  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, userId: user.id },
  });

  if (!contact) notFound();

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <a
          href={`/contacts/${id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Contact
        </a>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">
          Edit Contact
        </h1>
      </div>
      <EditContactForm contact={contact} />
    </div>
  );
}
