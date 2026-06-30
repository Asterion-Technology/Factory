import { getOrCreateDbUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONTACT_TYPE_LABELS } from "@/types";
import Link from "next/link";

export default async function ContactsPage() {
  const user = await getOrCreateDbUser();

  const contacts = await prisma.contact.findMany({
    where: { userId: user.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { _count: { select: { assignments: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Contacts</h1>
        <Link
          href="/contacts/new"
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          New Contact
        </Link>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-500">No contacts yet.</p>
          <Link
            href="/contacts/new"
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Add your first contact
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  Phone
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  Assignments
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="font-medium text-slate-800 hover:text-blue-700"
                    >
                      {c.name}
                    </Link>
                    {c.company && (
                      <p className="text-xs text-slate-400">{c.company}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {CONTACT_TYPE_LABELS[c.type]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="hover:text-blue-700"
                      >
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {c._count.assignments}
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
