import type { NextRequest } from 'next/server';
import { getVerifiedSession } from '@stopallcalls/db';
import { getSessionToken, jsonOk, withErrorHandling } from '@/lib/api';
import { getAuthStore } from '@/lib/store';

// Lets the wizard decide whether to show the verification step. Returns only
// the verified email — never the token or session internals.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const token = getSessionToken(req);
    const session = token ? await getVerifiedSession(getAuthStore(), token) : null;
    return jsonOk({ email: session?.email ?? null });
  });
}
