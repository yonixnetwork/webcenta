import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { buildPoolConfig } from "./db-config";

/**
 * Single Prisma client per process, created lazily on first use (so `next build`
 * never needs database credentials). Runtime traffic uses DATABASE_URL — on
 * Supabase the Supavisor *transaction* pooler (port 6543). Migrations use
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

const g = globalThis as unknown as { __webcentaPrisma?: PrismaClient };

function client(): PrismaClient {
  g.__webcentaPrisma ??= createClient();
  return g.__webcentaPrisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
