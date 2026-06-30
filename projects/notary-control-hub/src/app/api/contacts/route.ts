import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { createContactSchema } from "@/lib/validations/contact";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const user = await getOrCreateDbUser();

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(contacts);
  } catch {
    return errorResponse("Unauthorized", 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getOrCreateDbUser();
    const body = await req.json();

    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.errors[0]?.message ?? "Invalid input", 400);
    }

    const contact = await prisma.contact.create({
      data: { ...parsed.data, userId: user.id },
    });

    return NextResponse.json(contact, { status: 201 });
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
