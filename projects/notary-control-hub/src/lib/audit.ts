import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface AuditParams {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog({
  userId,
  action,
  entityType,
  entityId,
  metadata,
}: AuditParams) {
  const headersList = await headers();
  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    undefined;
  const userAgent = headersList.get("user-agent") ?? undefined;

  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
      ipAddress,
      userAgent,
    },
  });
}
