'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

interface StaffIdentity {
  id: string;
  email: string;
  role: string;
}

// Staff portal shell (UI-002..006 home). Authorization is server-side —
// Cloudflare Access at the edge plus requireStaff on every /api/staff route;
// this shell only reflects the verified identity back and renders nothing
// case-related when the identity probe fails.
export default function StaffLayout({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch('/api/staff/me')
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const body = (await r.json()) as { staff: StaffIdentity };
        setStaff(body.staff);
      })
      .catch(() => setDenied(true));
  }, []);

  if (denied) {
    return (
      <main className="staff-shell">
        <p className="error">Not authorized. Staff access requires a verified session.</p>
      </main>
    );
  }

  return (
    <main className="staff-shell">
      <header className="staff-header">
        <div>
          <strong>Stops All Calls</strong> <span className="staff-tag">staff</span>
        </div>
        <nav className="nav-row">
          <Link className="link" href="/staff">
            Queue
          </Link>
          <Link className="link" href="/staff/ops">
            Operations
          </Link>
          <Link className="link" href="/staff/admin">
            Admin
          </Link>
        </nav>
        <div className="staff-identity">
          {staff ? (
            <>
              {staff.email} · <span className="staff-tag">{staff.role}</span>
            </>
          ) : (
            'verifying…'
          )}
        </div>
      </header>
      {children}
    </main>
  );
}
