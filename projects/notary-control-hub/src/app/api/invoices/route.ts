import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createInvoiceSchema } from "@/lib/validations/invoice";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${year}-${rand}`;
}

export async function GET() {
  try {
    const user = await getOrCreateDbUser();

    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
      include: { contact: true, assignment: { select: { borrowerName: true } } },
    });

    return NextResponse.json(invoices);
  } catch {
    return errorResponse("Unauthorized", 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateDbUser();
    const body = await req.json();

    const parsed = createInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const data = parsed.data;

    if (data.assignmentId) {
      const assignment = await prisma.assignment.findFirst({
        where: { id: data.assignmentId, userId: user.id },
      });
      if (!assignment) return errorResponse("Assignment not found", 404);
    }

    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, userId: user.id },
      });
      if (!contact) return errorResponse("Contact not found", 404);
    }

    const { lineItems, ...invoiceData } = data;

    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        invoiceNumber: generateInvoiceNumber(),
        dueAt: invoiceData.dueAt ? new Date(invoiceData.dueAt) : undefined,
        ...invoiceData,
        lineItems: lineItems
          ? {
              create: lineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),
            }
          : undefined,
      },
    });

    if (data.assignmentId) {
      await prisma.assignment.update({
        where: { id: data.assignmentId },
        data: { status: "INVOICED" },
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: "INVOICE_CREATED",
      entityType: "Invoice",
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, total: data.total },
    });

    return NextResponse.json({ id: invoice.id }, { status: 201 });
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
