import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  CHECKLIST_TEMPLATES,
  getDefaultChecklistsForAssignmentType,
} from "@/lib/checklists";
import { createAssignmentSchema as validationSchema } from "@/lib/validations/assignment";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const user = await getOrCreateDbUser();

    const assignments = await prisma.assignment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { contact: true },
    });

    return NextResponse.json(assignments);
  } catch {
    return errorResponse("Unauthorized", 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateDbUser();
    const body = await req.json();

    const parsed = validationSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const data = parsed.data;

    // Ensure contactId belongs to this user
    if (data.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: data.contactId, userId: user.id },
      });
      if (!contact) return errorResponse("Contact not found", 404);
    }

    const assignment = await prisma.assignment.create({
      data: {
        userId: user.id,
        type: data.type,
        contactId: data.contactId,
        borrowerName: data.borrowerName,
        borrowerPhone: data.borrowerPhone,
        borrowerEmail: data.borrowerEmail,
        appointmentAt: data.appointmentAt ? new Date(data.appointmentAt) : undefined,
        location: data.location,
        address: data.address,
        fee: data.fee,
        travelFee: data.travelFee,
        printingFee: data.printingFee,
        mileage: data.mileage,
        travelNotes: data.travelNotes,
        specialInstructions: data.specialInstructions,
        scanbackRequired: data.scanbackRequired ?? false,
        deadlineAt: data.deadlineAt ? new Date(data.deadlineAt) : undefined,
      },
    });

    // Auto-create checklists for the assignment type
    const templateTypes = getDefaultChecklistsForAssignmentType(data.type);
    for (const templateType of templateTypes) {
      const checklist = await prisma.assignmentChecklist.create({
        data: { assignmentId: assignment.id, templateType },
      });

      const items = CHECKLIST_TEMPLATES[templateType];
      await prisma.assignmentChecklistItem.createMany({
        data: items.map((label, i) => ({
          checklistId: checklist.id,
          label,
          sortOrder: i,
        })),
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: "ASSIGNMENT_CREATED",
      entityType: "Assignment",
      entityId: assignment.id,
      metadata: { type: assignment.type },
    });

    return NextResponse.json({ id: assignment.id }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse("Internal server error", 500);
  }
}
