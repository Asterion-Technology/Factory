import { z } from "zod";

export const AssignmentTypeEnum = z.enum([
  "GENERAL",
  "LOAN_SIGNING",
  "RON",
  "MOBILE",
]);

export const AssignmentStatusEnum = z.enum([
  "NEW",
  "CONFIRMED",
  "DOCS_RECEIVED",
  "PRINTED",
  "IN_PROGRESS",
  "COMPLETED",
  "INVOICED",
  "PAID",
  "CANCELLED",
]);

export const createAssignmentSchema = z.object({
  type: AssignmentTypeEnum,
  contactId: z.string().cuid().optional(),
  borrowerName: z.string().max(200).optional(),
  borrowerPhone: z
    .string()
    .regex(/^\+?[\d\s\-().]{7,20}$/)
    .optional()
    .or(z.literal("")),
  borrowerEmail: z.string().email().max(320).optional().or(z.literal("")),
  appointmentAt: z.string().datetime().optional(),
  location: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  fee: z.number().nonnegative().max(99999).optional(),
  travelFee: z.number().nonnegative().max(9999).optional(),
  printingFee: z.number().nonnegative().max(9999).optional(),
  mileage: z.number().nonnegative().max(99999).optional(),
  travelNotes: z.string().max(1000).optional(),
  specialInstructions: z.string().max(2000).optional(),
  scanbackRequired: z.boolean().optional(),
  deadlineAt: z.string().datetime().optional(),
});

export const updateAssignmentSchema = createAssignmentSchema.partial();

export const updateStatusSchema = z.object({
  status: AssignmentStatusEnum,
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
