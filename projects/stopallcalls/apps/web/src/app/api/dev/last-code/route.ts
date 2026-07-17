import type { NextRequest } from 'next/server';
import { normalizedEmailSchema } from '@stopallcalls/contracts';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getDevCode } from '@/lib/store';

// E2E support only: lets Playwright read the code the fake email adapter
// "sent". getDevCode returns null unless the server was started with
// SAC_E2E_EXPOSE_CODES=1, so in any normal environment this route is a 404.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    const raw = req.nextUrl.searchParams.get('email') ?? '';
    const parsed = normalizedEmailSchema.safeParse(raw);
    const code = parsed.success ? getDevCode(parsed.data) : null;
    if (!code) return jsonError(404, 'NOT_FOUND', 'Not found.');
    return jsonOk({ code });
  });
}
