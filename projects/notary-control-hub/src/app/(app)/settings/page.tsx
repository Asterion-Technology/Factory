import { getOrCreateDbUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

export default async function SettingsPage() {
  const user = await getOrCreateDbUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Settings</h1>

      <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
        <div className="px-6 py-4">
          <h2 className="text-sm font-medium text-slate-700">Notary Profile</h2>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Commission State
            </label>
            <p className="mt-1 text-sm text-slate-600">
              {user.notaryState ?? "Not set"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Stamp / Commission Expiry
            </label>
            <p className="mt-1 text-sm text-slate-600">
              {user.stampExpiry ? formatDate(user.stampExpiry) : "Not set"}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              E&O Insurance Expiry
            </label>
            <p className="mt-1 text-sm text-slate-600">
              {user.eoExpiry ? formatDate(user.eoExpiry) : "Not set"}
            </p>
          </div>

          <p className="text-xs text-slate-400">
            Profile editing coming in a future update.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-4 space-y-2">
        <h2 className="text-sm font-medium text-amber-900">
          Compliance Reminder
        </h2>
        <ul className="space-y-1 text-sm text-amber-800">
          <li>• Follow your state notary laws at all times.</li>
          <li>• Verify signer identity according to applicable rules.</li>
          <li>
            • Do not proceed if a signer is unwilling, unaware, or improperly
            identified.
          </li>
          <li>• Securely dispose of temporary documents after each assignment.</li>
          <li>
            • This tool helps organize workflow only — it does not provide legal
            advice or determine notarial legality.
          </li>
        </ul>
      </div>
    </div>
  );
}
