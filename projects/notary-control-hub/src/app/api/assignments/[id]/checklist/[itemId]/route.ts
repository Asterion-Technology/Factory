import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  completed: z.boolean(),
});

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id: assignmentId, itemId } = await params;

    // Verify the checklist item belongs to this user's assignment
    const item = await prisma.assignmentChecklistItem.findFirst({
      where: {
        id: itemId,
        checklist: {
          assignment: { id: assignmentId, userId: user.id },
        },
      },
    });
    if (!item) return errorResponse("Not found", 404);

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid input", 400);

    const updated = await prisma.assignmentChecklistItem.update({
      where: { id: itemId },
      data: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    });

    return NextResponse.json(updated);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
