import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// A whole-pool write is one all-or-nothing transaction with one statement per row over a remote
// connection: 188 UPDATEs took 5.1 s on 17/09 against Prisma's 5 s default, and the pool grows.
// maxWait is the time to obtain a connection; timeout is the time the open transaction may run.
export const WRITE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}