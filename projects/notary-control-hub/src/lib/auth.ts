import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");
  return clerkId;
}

export async function getDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  return prisma.user.findUnique({ where: { clerkId } });
}

export async function getOrCreateDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const existing = await prisma.user.findUnique({ where: { clerkId } });
  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) throw new Error("User not found");

  return prisma.user.create({
    data: {
      clerkId,
      email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
    },
  });
}
