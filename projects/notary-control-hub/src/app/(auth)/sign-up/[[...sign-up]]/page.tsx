import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Notary Control Hub</h1>
          <p className="mt-1 text-sm text-slate-500">Create your account</p>
        </div>
        <SignUp />
        <p className="mt-6 text-center text-xs text-slate-400">
          This tool is for notary workflow management only. It does not provide
          legal advice. Follow your state notary laws at all times.
        </p>
      </div>
    </main>
  );
}
