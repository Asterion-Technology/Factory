import type { NextRequest } from 'next/server';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';

// Identity echo for the staff portal shell — who am I, what can I do.
// Unauthenticated callers get the same opaque 404 as every staff route.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const staff = await requireStaff(req);
    return jsonOk({ staff });
  });
}
