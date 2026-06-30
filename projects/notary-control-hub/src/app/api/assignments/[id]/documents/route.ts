import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, BUCKET, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/r2";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id: assignmentId } = await params;

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, userId: user.id },
    });
    if (!assignment) return errorResponse("Not found", 404);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const expiresInDays = Number(formData.get("expiresInDays") ?? "30");

    if (!file) return errorResponse("No file provided", 400);
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return errorResponse("File type not allowed", 415);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return errorResponse("File exceeds 25 MB limit", 413);
    }

    const ext = file.name.split(".").pop() ?? "bin";
    const storageKey = `${user.id}/${assignmentId}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // R2 encrypts all objects at rest by default; ServerSideEncryption param is not supported
    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: storageKey,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
          userId: user.id,
          assignmentId,
          originalName: file.name,
        },
      })
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Math.min(expiresInDays, 365));

    const document = await prisma.document.create({
      data: {
        userId: user.id,
        assignmentId,
        originalName: file.name,
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        expiresAt,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "DOCUMENT_UPLOADED",
      entityType: "Document",
      entityId: document.id,
      metadata: { assignmentId, originalName: file.name, sizeBytes: file.size },
    });

    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
