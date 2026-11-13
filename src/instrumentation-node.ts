/**
 * Node.js-only startup work (imported by instrumentation.ts in the nodejs runtime).
 *
 * Applies pending database migrations and the idempotent base data automatically, so a
 * fresh Hostinger database is initialised on the first deployment and later schema
 * changes need no manual step. Serialised across processes by a database lock
 * (GET_LOCK in applyPendingMigrations); runs in the background and never blocks or
 * crashes startup. Set WEBCENTA_AUTO_MIGRATE=false to disable (e.g. to migrate by hand).
 */
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Logs which startup variables the process received (names only, never values) so the
 * hosting runtime log shows whether every process has its configuration, then starts
 * the background startup tasks.
 */
export async function registerNode() {
  const required = ["DATABASE_URL", "FIELD_ENCRYPTION_KEY", "PUBLIC_ORIGIN", "NODE_ENV"];
  const missing = required.filter((k) => !process.env[k]);
  const snapshot = existsSync(path.join(process.cwd(), ".env.production"));
  console.log(
    `[webcenta] process start pid=${process.pid} node=${process.version} public=${process.env.PUBLIC_ORIGIN ?? "-"} ` +
      `admin=${process.env.ADMIN_ORIGIN ?? "(derived)"} developers=${process.env.DEVELOPER_ORIGIN ?? "(derived)"} ` +
      `startup-variables=${missing.length ? `MISSING ${missing.join(",")}` : "ok"} env-snapshot=${snapshot ? "present" : "absent"}`,
  );
  void startupTasks();
}

export async function startupTasks() {
  if (!process.env.DATABASE_URL || process.env.WEBCENTA_AUTO_MIGRATE === "false") return;
  try {
    const { applyPendingMigrations, migrationStatus } = await import("@/server/setup/migrate");
    const before = await migrationStatus();
    if (!before.dir) return console.log("[webcenta] auto-migrate: no migrations folder in this deployment");
    const pending = before.migrations.filter((m) => m.state === "pending").length;
    const r = pending ? await applyPendingMigrations() : { applied: [], message: "The database is up to date." };
    const { db } = await import("@/server/db");
    const { seedBase, baseSeedVersion, BASE_SEED_VERSION } = await import("@/server/setup/base-seed");
    if (r.applied.length || (await db.category.count()) === 0 || (await baseSeedVersion(db)) < BASE_SEED_VERSION) {
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
