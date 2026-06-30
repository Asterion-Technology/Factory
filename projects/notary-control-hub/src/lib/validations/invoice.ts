import { z } from "zod";

export const InvoiceStatusEnum = z.enum([
  "DRAFT",
  "SENT",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().positive().max(9999),
  unitPrice: z.number().nonnegative().max(99999),
  subtotal: z.number().nonnegative().max(9999999),
});

export const createInvoiceSchema = z.object({
  assignmentId: z.string().cuid().optional(),
  contactId: z.string().cuid().optional(),
  dueAt: z.string().datetime().optional(),
  fee: z.number().nonnegative().max(99999).optional(),
  travelFee: z.number().nonnegative().max(9999).optional(),
  printingFee: z.number().nonnegative().max(9999).optional(),
  additionalFees: z.number().nonnegative().max(9999).optional(),
  total: z.number().nonnegative().max(9999999),
  notes: z.string().max(2000).optional(),
  paymentNotes: z.string().max(2000).optional(),
  lineItems: z.array(invoiceLineItemSchema).max(50).optional(),
});

export const updateInvoiceSchema = createInvoiceSchema
  .partial()
  .extend({ status: InvoiceStatusEnum.optional() });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
