import type { NextRequest } from 'next/server';
import { decryptSecret } from '@stopallcalls/db';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { clioConnectEnabled, getClioOAuthConfig, getClioTokenKey } from '@/lib/clio';
import { getClioConnectionStore } from '@/lib/store';

// Admin/ops probe (same interim gate as connect): proves the stored
// connection authenticates against Clio. Never returns token material.
export async function GET(_req: NextRequest) {
  return withErrorHandling(async () => {
    if (!clioConnectEnabled()) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const connection = await getClioConnectionStore().get();
    if (!connection) return jsonOk({ connected: false });
    const accessToken = await decryptSecret(getClioTokenKey(), connection.accessTokenEncrypted);
    const who = await fetch(`${getClioOAuthConfig().baseUrl}/api/v4/users/who_am_i.json?fields=id,name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = who.ok ? ((await who.json()) as { data?: { name?: string } }) : null;
    return jsonOk({
      connected: true,
      tenantRef: connection.tenantRef,
      tokenExpiresAt: connection.expiresAt,
      apiCheck: who.ok ? `ok (${body?.data?.name ?? 'unknown user'})` : `failed (${who.status})`,
    });
  });
}
