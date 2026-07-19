import { z } from 'zod';

// INT-004: configurable maximum agency entries per intake.
export const DEFAULT_MAX_AGENCIES = 20;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// INT-006: unknown is a legitimate answer — never force fabricated data.
const unknownable = <T extends z.ZodTypeAny>(schema: T) => schema.nullish();

export const contactMethodSchema = z.enum(['EMAIL', 'PHONE', 'TEXT', 'MAIL']);

export const contactChannelSchema = z.enum([
  'PHONE',
  'TEXT',
  'EMAIL',
  'LETTER',
  'VOICEMAIL',
  'CREDIT_REPORT',
]);

export const allegationSchema = z.enum([
  'THREATS',
  'HARASSMENT',
  'WORKPLACE_CALLS',
  'FAMILY_CALLS',
  'THIRD_PARTY_CONTACT',
]);

// INT-003
export const consumerProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: isoDate,
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(20),
  address: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).nullish(),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
    country: z.string().trim().length(2),
  }),
  preferredContactMethod: contactMethodSchema,
});

// INT-005: account numbers arrive masked; the full number is never collected
// as a form field (DATA-001).
export const agencyEntrySchema = z.object({
  agencyName: z.string().trim().min(1).max(200),
  agencyPhone: unknownable(z.string().trim().max(20)),
  agencyEmail: unknownable(z.string().trim().email().max(254)),
  agencyMailingAddress: unknownable(z.string().trim().max(500)),
  originalCreditor: unknownable(z.string().trim().max(200)),
  debtBuyer: unknownable(z.string().trim().max(200)),
  accountNumberLast4: unknownable(z.string().trim().regex(/^[0-9A-Za-z]{1,4}$/)),
  amountClaimedCents: unknownable(z.number().int().nonnegative()),
  currency: z.string().trim().length(3).default('CAD'),
  dateFirstContacted: unknownable(isoDate),
  dateLastContacted: unknownable(isoDate),
  contactChannels: z.array(contactChannelSchema).min(1),
  stillContacting: unknownable(z.boolean()),
  contactFrequency: unknownable(z.string().trim().max(200)),
  allegations: z.array(allegationSchema).default([]),
  // RAD-19: set when the consumer picked the agency from the authorized
  // registry (id from authorized_agencies); cleared if they edit the name.
  // Free-text entry stays fully valid — never require a registry match.
  authorizedAgencyId: unknownable(z.string().trim().max(100)),
});

export const intakeCreateSchema = z.object({
  profile: consumerProfileSchema,
});

// API-002: mutations carry the version the client last saw.
export const intakePatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  profile: consumerProfileSchema.partial().optional(),
});

export const addAgencySchema = z.object({
  expectedVersion: z.number().int().positive(),
  agency: agencyEntrySchema,
});

// SRS intake page 6: every statement must be affirmatively accepted.
export const attestationsSchema = z.object({
  isConsumer: z.literal(true),
  contactConfirmed: z.literal(true),
  informationTrue: z.literal(true),
  authorizeLetter: z.literal(true),
});

export const intakeSubmitSchema = z.object({
  expectedVersion: z.number().int().positive(),
  attestations: attestationsSchema,
});

export type ConsumerProfile = z.infer<typeof consumerProfileSchema>;
export type AgencyEntry = z.infer<typeof agencyEntrySchema>;
export type IntakeCreate = z.infer<typeof intakeCreateSchema>;
export type IntakePatch = z.infer<typeof intakePatchSchema>;
export type Attestations = z.infer<typeof attestationsSchema>;
export type IntakeSubmit = z.infer<typeof intakeSubmitSchema>;
