import { Sidebar } from "@/components/nav/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6 print:p-0 print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
