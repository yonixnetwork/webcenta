import { db } from "@/server/db";

/**
 * Read-only database status for Admin → Settings → Database. The connection
 * itself (DATABASE_URL) lives in the hosting environment: the application needs
 * it before it can read any setting, so it cannot be edited here.
 */
export async function databaseStatus() {
  const url = process.env.DATABASE_URL ?? "";
  let target = "DATABASE_URL is not set";
  try {
    const u = new URL(url);
    target = `${u.protocol}//${decodeURIComponent(u.username)}:•••@${u.host}${u.pathname}`;
  } catch { /* keep message */ }
  const started = Date.now();
  try {
    const [v] = await db.$queryRaw<Array<{ version: string; db: string; tz: string }>>`SELECT VERSION() AS version, DATABASE() AS db, @@session.time_zone AS tz`;
    const latencyMs = Date.now() - started;
    const [size] = await db.$queryRaw<Array<{ tables: bigint | number; bytes: bigint | number | null }>>`
      SELECT COUNT(*) AS tables, SUM(DATA_LENGTH + INDEX_LENGTH) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
    const migrations = await db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 50`.catch(() => []);
    return {
      ok: true as const, target, latencyMs, version: v?.version ?? "?", database: v?.db ?? "?", timeZone: v?.tz ?? "?",
      tables: Number(size?.tables ?? 0), sizeMb: Math.round((Number(size?.bytes ?? 0) / 1024 / 1024) * 10) / 10,
      applied: migrations.filter((m) => m.finished_at && !m.rolled_back_at).length,
      failed: migrations.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name),
      latest: migrations.find((m) => m.finished_at)?.migration_name ?? null,
      poolMax: Number(process.env.DATABASE_POOL_MAX ?? 5),
    };
  } catch (e) {
    return { ok: false as const, target, error: (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300) };
  }
}
