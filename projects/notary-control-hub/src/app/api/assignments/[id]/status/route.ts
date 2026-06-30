import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { updateStatusSchema } from "@/lib/validations/assignment";
import { STATUS_TRANSITIONS } from "@/types";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const assignment = await prisma.assignment.findFirst({
      where: { id, userId: user.id },
    });
    if (!assignment) return errorResponse("Not found", 404);

    const body = await req.json();
    const parsed = updateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid status", 400);
    }

    const { status } = parsed.data;
    const allowed = STATUS_TRANSITIONS[assignment.status] ?? [];

    if (!allowed.includes(status)) {
      return errorResponse(
        `Cannot transition from ${assignment.status} to ${status}`,
        422
      );
    }

    const updated = await prisma.assignment.update({
      where: { id },
      data: {
        status,
        completedAt:
          status === "COMPLETED" ? new Date() : assignment.completedAt,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "ASSIGNMENT_STATUS_CHANGED",
      entityType: "Assignment",
      entityId: id,
      metadata: { from: assignment.status, to: status },
    });

    return NextResponse.json(updated);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
