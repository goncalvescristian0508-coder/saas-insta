import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function prismaUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  // Serverless: one connection per instance is enough.
  // Keeps the Supabase pool free for other concurrent functions.
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=2&pool_timeout=10`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: prismaUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
