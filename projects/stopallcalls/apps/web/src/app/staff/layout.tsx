'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
const NAV_ITEMS = [
  { href: '/staff', label: 'Queue' },
  { href: '/staff/ops', label: 'Operations' },
  { href: '/staff/admin', label: 'Admin' },
] as const;

export default function StaffLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [denied, setDenied] = useState(false);

  // Detail pages (intakes/matters) belong to the Queue section; exact match
  // keeps /staff from claiming every route.
  const isActive = (href: string) =>
    href === '/staff' ? pathname === '/staff' || pathname.startsWith('/staff/intakes') || pathname.startsWith('/staff/matters') : pathname.startsWith(href);

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
      <header className="staff-nav">
        <div className="staff-brand">
          <strong>Stops All Calls</strong> <span className="staff-tag">staff</span>
        </div>
        <nav className="staff-nav-links" aria-label="Staff sections">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`staff-nav-link${isActive(item.href) ? ' staff-nav-active' : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
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
