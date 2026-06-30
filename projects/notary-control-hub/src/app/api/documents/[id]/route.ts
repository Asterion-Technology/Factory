import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateDbUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getPresignedDownloadUrl, deleteFromR2 } from "@/lib/r2";
import { createHash } from "crypto";

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

    const doc = await prisma.document.findFirst({
      where: { id, userId: user.id, purgedAt: null },
    });
    if (!doc) return errorResponse("Not found", 404);

    const url = await getPresignedDownloadUrl(doc.storageKey);

    await writeAuditLog({
      userId: user.id,
      action: "DOCUMENT_DOWNLOADED",
      entityType: "Document",
      entityId: id,
    });

    return NextResponse.redirect(url);
  } catch {
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getOrCreateDbUser();
    const { id } = await params;

    const doc = await prisma.document.findFirst({
      where: { id, userId: user.id, purgedAt: null },
    });
    if (!doc) return errorResponse("Not found", 404);

    const body = await req.json().catch(() => ({}));
    const attested = body.attested === true;

    await deleteFromR2(doc.storageKey);

    const now = new Date();
    await prisma.document.update({
      where: { id },
      data: { purgedAt: now },
    });

    if (attested) {
      const checksum = createHash("sha256")
        .update(`${id}:${doc.storageKey}:${doc.originalName}:${now.toISOString()}`)
        .digest("hex");

      await prisma.purgeAttestation.create({
        data: {
          userId: user.id,
          documentId: id,
          checksum,
        },
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: "DOCUMENT_PURGED",
      entityType: "Document",
      entityId: id,
      metadata: { attested, originalName: doc.originalName },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return errorResponse("Internal server error", 500);
  }
}
