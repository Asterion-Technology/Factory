import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { updateContactSchema } from "@/lib/validations/contact";

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

    const contact = await prisma.contact.findFirst({
      where: { id, userId: user.id },
      include: {
        assignments: {
          orderBy: { appointmentAt: "desc" },
          take: 10,
        },
        communicationLogs: { orderBy: { occurredAt: "desc" }, take: 20 },
      },
    });

    if (!contact) return errorResponse("Not found", 404);
    return NextResponse.json(contact);
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

    const existing = await prisma.contact.findFirst({
      where: { id, userId: user.id },
    });
    if (!existing) return errorResponse("Not found", 404);

    const body = await req.json();
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(updated);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
