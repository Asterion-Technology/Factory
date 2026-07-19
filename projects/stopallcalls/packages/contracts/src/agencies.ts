import { z } from 'zod';

// RAD-19: authorized-agency lookup. Query params for GET /api/agencies/search
// and the public-safe projection returned to the wizard. Registry rows are
// public business data — the projection just excludes search internals
// (normalized/canonical columns) and structured address parts.

export const AGENCY_SEARCH_MIN_QUERY = 2;

export const agencySearchQuerySchema = z.object({
  q: z.string().trim().min(AGENCY_SEARCH_MIN_QUERY).max(200),
  country: z.enum(['CA', 'US']).default('CA'),
  region: z.string().trim().min(2).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(10).default(8),
});

export const licenceStatusSchema = z.enum(['active', 'expired', 'suspended', 'revoked', 'unknown']);

export const authorizedAgencySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  country: z.enum(['CA', 'US']),
  region: z.string(),
  licenceNumber: z.string().nullable(),
  licenceStatus: licenceStatusSchema,
  expiresAt: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  /** Single line, ready to prefill the intake `agencyMailingAddress` field. */
  mailingAddress: z.string().nullable(),
  sourceRegistry: z.string(),
  verifiedAt: z.string(),
});

export type AgencySearchQuery = z.infer<typeof agencySearchQuerySchema>;
export type AuthorizedAgencySummary = z.infer<typeof authorizedAgencySummarySchema>;
