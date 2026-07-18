import type { NextRequest } from 'next/server';
import { INTAKE_STATES, type IntakeState } from '@stopallcalls/domain';
import { jsonOk, withErrorHandling } from '@/lib/api';
import { requireStaff } from '@/lib/staff';
import { getIntakeStore } from '@/lib/store';

// UI-002: the staff queue. Summaries only — the profile fields staff need to
// recognize a case, never the consumerKey ownership handle. The free-text
// filter runs server-side so PII stays out of URLs beyond what staff typed.
export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireStaff(req);
    const url = new URL(req.url);
    const stateParam = url.searchParams.get('state');
    const state =
      stateParam && (INTAKE_STATES as readonly string[]).includes(stateParam)
        ? (stateParam as IntakeState)
        : undefined;
    const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';

    const records = await getIntakeStore().listForStaff({ state, limit: 200 });
    const intakes = records
      .map((r) => {
        const profile = r.submittedSnapshot?.profile ?? r.profile;
        const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
        return {
          id: r.id,
          state: r.state,
          jurisdiction: r.jurisdiction,
          name: name || null,
          email: profile?.email ?? null,
          agencyCount: (r.submittedSnapshot?.agencies ?? r.agencies).length,
          submittedAt: r.submittedSnapshot?.submittedAt ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
      .filter(
        (s) =>
          !q ||
          (s.name ?? '').toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    return jsonOk({ intakes });
  });
}
