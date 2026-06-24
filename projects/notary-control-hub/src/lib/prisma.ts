import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

// Next.js env loading never overrides an existing process.env entry, so a stale
// Windows user-level DATABASE_URL silently beats .env. Force-read .env.local here,
// before PrismaClient instantiates, so the local override always wins.
try {
  const lines = readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(DATABASE_URL|DIRECT_URL)="?([^"#\r\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local absent — rely on standard env loading
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
