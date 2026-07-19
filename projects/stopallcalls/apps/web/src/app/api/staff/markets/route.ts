import type { NextRequest } from 'next/server';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';
import { getMarketStore } from '@/lib/store';

// UI-005: market configuration read for the admin screen.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireStaff(req);
    return jsonOk({ markets: await getMarketStore().list() });
  });
}
