import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { updateAssignmentSchema } from "@/lib/validations/assignment";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function getAssignment(userId: string, id: string) {
  const assignment = await prisma.assignment.findFirst({
    where: { id, userId },
  });
  return assignment;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const assignment = await prisma.assignment.findFirst({
      where: { id, userId: user.id },
      include: {
        contact: true,
        checklists: { include: { items: { orderBy: { sortOrder: "asc" } } } },
        documents: { where: { purgedAt: null }, orderBy: { uploadedAt: "desc" } },
        invoice: true,
      },
    });

    if (!assignment) return errorResponse("Not found", 404);
    return NextResponse.json(assignment);
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

    const existing = await getAssignment(user.id, id);
    if (!existing) return errorResponse("Not found", 404);

    const body = await req.json();
    const parsed = updateAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const data = parsed.data;

    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, userId: user.id },
      });
      if (!contact) return errorResponse("Contact not found", 404);
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        ...data,
        appointmentAt: data.appointmentAt ? new Date(data.appointmentAt) : undefined,
        deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : undefined,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "ASSIGNMENT_UPDATED",
      entityType: "Assignment",
      entityId: id,
    });

    return NextResponse.json(updated);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const existing = await getAssignment(user.id, id);
    if (!existing) return errorResponse("Not found", 404);

    await prisma.assignment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await writeAuditLog({
      userId: user.id,
      action: "ASSIGNMENT_CANCELLED",
      entityType: "Assignment",
      entityId: id,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
