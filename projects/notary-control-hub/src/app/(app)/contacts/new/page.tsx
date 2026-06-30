import { NewContactForm } from "./form";

export default function NewContactPage() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <a href="/contacts" className="text-sm text-blue-600 hover:underline">
          ← Contacts
        </a>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">New Contact</h1>
      </div>
      <NewContactForm />
    </div>
  );
}
