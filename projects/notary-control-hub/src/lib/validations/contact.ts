import { z } from "zod";

export const ContactTypeEnum = z.enum([
  "SIGNING_CO",
  "TITLE",
  "ESCROW",
  "CLIENT",
  "BORROWER",
]);

export const createContactSchema = z.object({
  type: ContactTypeEnum,
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  email: z.string().email().max(320).optional().or(z.literal("")),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-().]{7,20}$/)
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
  paymentTerms: z.string().max(500).optional(),
  preferredInstructions: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateContactSchema = createContactSchema.partial().extend({
  name: z.string().min(1).max(200).optional(),
  type: ContactTypeEnum.optional(),
});

export const createCommunicationLogSchema = z.object({
  contactId: z.string().cuid(),
  assignmentId: z.string().cuid().optional(),
  channel: z.enum(["EMAIL", "PHONE", "SMS", "IN_PERSON"]),
  direction: z.enum(["IN", "OUT"]),
  summary: z.string().min(1).max(2000),
  occurredAt: z.string().datetime(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
