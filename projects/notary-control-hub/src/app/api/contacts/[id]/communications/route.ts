import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { createCommunicationLogSchema } from "@/lib/validations/contact";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id: contactId } = await params;

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId: user.id },
    });
    if (!contact) return errorResponse("Contact not found", 404);

    const body = await req.json();

    // Validate body fields (contactId comes from URL, not body)
    const parsed = createCommunicationLogSchema.omit({ contactId: true }).safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.errors[0]?.message ?? "Invalid input",
        400
      );
    }

    const { channel, direction, summary, occurredAt, assignmentId } = parsed.data;

    // Verify assignmentId belongs to user if provided
    if (assignmentId) {
      const assignment = await prisma.assignment.findFirst({
        where: { id: assignmentId, userId: user.id },
      });
      if (!assignment) return errorResponse("Assignment not found", 404);
    }

    const log = await prisma.communicationLog.create({
      data: {
        userId: user.id,
        contactId,
        assignmentId: assignmentId ?? null,
        channel,
        direction,
        summary,
        occurredAt: new Date(occurredAt),
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "COMMUNICATION_LOG_CREATED",
      entityType: "CommunicationLog",
      entityId: log.id,
      metadata: { contactId, channel, direction },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return errorResponse("Unauthorized", 401);
    }
    return errorResponse("Internal server error", 500);
  }
}
