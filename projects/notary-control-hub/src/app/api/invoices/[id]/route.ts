import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { updateInvoiceSchema } from "@/lib/validations/invoice";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id, userId: user.id },
      include: {
        contact: true,
        assignment: {
          select: { id: true, type: true, borrowerName: true, appointmentAt: true, address: true },
        },
        lineItems: true,
      },
    });

    if (!invoice) return errorResponse("Not found", 404);
    return NextResponse.json(invoice);
  } catch {
    return errorResponse("Unauthorized", 401);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const existing = await prisma.invoice.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return errorResponse("Not found", 404);

    const body = await req.json();
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const { lineItems, dueAt, ...rest } = parsed.data;

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...rest,
        dueAt: dueAt ? new Date(dueAt) : undefined,
        paidAt: rest.status === "PAID" ? new Date() : undefined,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "INVOICE_UPDATED",
      entityType: "Invoice",
      entityId: id,
      metadata: { status: rest.status },
    });

    return NextResponse.json(updated);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
