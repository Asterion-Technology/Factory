import Link from "next/link";
import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewInvoiceForm } from "./form";

export default async function NewInvoicePage() {
  const user = await getOrCreateDbUser();

  const [contacts, assignments] = await Promise.all([
    prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, company: true, paymentTerms: true },
    }),
    prisma.assignment.findMany({
      where: { userId: user.id, status: "COMPLETED", invoice: { is: null } },
      orderBy: { appointmentAt: "desc" },
      select: { id: true, borrowerName: true, appointmentAt: true, type: true, fee: true },
    }),
  ]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Link href="/invoices" className="text-sm text-blue-600 hover:underline">
          ← Invoices
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">New Invoice</h1>
      </div>
      <NewInvoiceForm contacts={contacts} assignments={assignments} />
    </div>
  );
}
