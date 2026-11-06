import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { buildPoolConfig } from "./db-config";

/**
 * Single Prisma client per process. Runtime traffic uses DATABASE_URL — on
 * Supabase this is the Supavisor *transaction* pooler (port 6543). Migrations use
 * DIRECT_URL (session pooler, port 5432) via prisma.config.ts.
 */
function createClient() {
  const e = env();
  const { pool } = buildPoolConfig(e);
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: e.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { __webcenterPrisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.__webcenterPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__webcenterPrisma = db;
