import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";

// Same stale-Windows-env-var guard as src/lib/prisma.ts — applied here so
// anything Next.js injects into the build environment also uses the local URL.
try {
  const lines = readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(DATABASE_URL|DIRECT_URL)="?([^"#\r\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {
  // .env.local absent — rely on standard env loading
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3001"],
    },
  },
};

export default nextConfig;
