/**
 * Node.js-only startup work (imported by instrumentation.ts in the nodejs runtime).
 *
 * Applies pending database migrations and the idempotent base data automatically, so a
 * fresh Hostinger database is initialised on the first deployment and later schema
 * changes need no manual step. Serialised across processes by a database lock
 * (GET_LOCK in applyPendingMigrations); runs in the background and never blocks or
 * crashes startup. Set WEBCENTA_AUTO_MIGRATE=false to disable (e.g. to migrate by hand).
 */
export async function startupTasks() {
  if (!process.env.DATABASE_URL || process.env.WEBCENTA_AUTO_MIGRATE === "false") return;
  try {
    const { applyPendingMigrations, migrationStatus } = await import("@/server/setup/migrate");
    const before = await migrationStatus();
    if (!before.dir) return console.log("[webcenta] auto-migrate: no migrations folder in this deployment");
    const pending = before.migrations.filter((m) => m.state === "pending").length;
    const r = pending ? await applyPendingMigrations() : { applied: [], message: "The database is up to date." };
    const { db } = await import("@/server/db");
    if (r.applied.length || (await db.category.count()) === 0) {
      const { seedBase } = await import("@/server/setup/base-seed");
      const notes: string[] = [];
      await seedBase(db, (m) => notes.push(m));
      console.log(`[webcenta] auto-migrate: ${r.message} Base data: ${notes.join("; ")}`);
    } else {
      console.log(`[webcenta] auto-migrate: ${r.message}`);
    }
  } catch (e) {
    console.error(`[webcenta] auto-migrate failed: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
  }
}
