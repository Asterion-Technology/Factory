import type { NextRequest } from 'next/server';
import { agencySearchQuerySchema, type AuthorizedAgencySummary } from '@stopallcalls/contracts';
import { ServiceError } from '@stopallcalls/db';
import {
  agencyMailingAddress,
  normalizeCanadianRegion,
  type AuthorizedAgency,
} from '@stopallcalls/domain';
import { getRemoteKey, jsonOk, requireVerifiedSession, withErrorHandling } from '@/lib/api';
import { getAuthorizedAgencyStore, getRateLimiter } from '@/lib/store';

// RAD-19: authorized-agency typeahead lookup. Registry rows are public
// business data, but the endpoint still requires the wizard's verified
// session and a per-IP budget — the compiled registry must not become an
// anonymous bulk-harvesting surface. Search failures never block intake;
// the client degrades to plain free-text entry.

// Generous typeahead budget: a debounced input emits a few requests per name.
const SEARCH_LIMIT = 60;
const SEARCH_WINDOW_MS = 60_000;

function toSummary(a: AuthorizedAgency): AuthorizedAgencySummary {
  return {
    id: a.id,
    name: a.name,
    aliases: a.aliases,
    country: a.country,
    region: a.region,
    licenceNumber: a.licenceNumber,
    licenceStatus: a.licenceStatus,
    expiresAt: a.expiresAt,
    phone: a.phone,
    email: a.email,
    website: a.website,
    mailingAddress: agencyMailingAddress(a),
    sourceRegistry: a.sourceRegistry,
    verifiedAt: a.verifiedAt,
  };
}

export async function GET(req: NextRequest) {
  return withErrorHandling(async () => {
    await requireVerifiedSession(req);
    const remoteKey = getRemoteKey(req);
    if (!getRateLimiter().allow(`agency-search:ip:${remoteKey}`, SEARCH_LIMIT, SEARCH_WINDOW_MS)) {
      throw new ServiceError(429, 'RATE_LIMITED', 'Too many searches. Please wait a moment and try again.');
    }

    const params = agencySearchQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    // The profile captures region as free text; an unrecognized value just
    // loses the local-region ranking boost — it never blocks the search.
    const region =
      params.country === 'CA' && params.region
        ? (normalizeCanadianRegion(params.region) ?? undefined)
        : params.region?.toUpperCase();

    const agencies = await getAuthorizedAgencyStore().search(params.q, {
      country: params.country,
      region,
      limit: params.limit,
    });
    return jsonOk({ agencies: agencies.map(toSummary) });
  });
}
