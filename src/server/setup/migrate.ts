import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import { env } from "@/lib/env";
import { buildPoolConfig } from "@/server/db-config";

/**
 * Applies pending Prisma migrations from inside the application, so first-time
 * setup and later upgrades do not need a terminal. Fully compatible with
 * `npx prisma migrate deploy`: it uses the same `_prisma_migrations` table, the
 * same checksum (SHA-256 of migration.sql) and the same failure semantics (a
 * failed migration is recorded and blocks further runs until resolved).
 */

export interface MigrationInfo { name: string; checksum: string; state: "applied" | "pending" | "failed" | "modified" }

/** prisma/migrations, in the source tree or copied next to the standalone server. */
export function migrationsDir(cwd = process.cwd()): string | null {
  for (const p of [path.join(cwd, "prisma/migrations"), path.join(cwd, "../../prisma/migrations")]) if (existsSync(p)) return p;
  return null;
}

async function localMigrations(dir: string): Promise<Array<{ name: string; sql: string; checksum: string }>> {
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(d.name)).map((d) => d.name).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(path.join(dir, name, "migration.sql"), "utf8");
    return { name, sql, checksum: createHash("sha256").update(sql, "utf8").digest("hex") };
  }));
}

async function connect(multipleStatements = false) {
  const { pool } = buildPoolConfig(env());
  return mariadb.createConnection({ ...pool, multipleStatements, bigIntAsNumber: true });
}

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id VARCHAR(36) NOT NULL, checksum VARCHAR(64) NOT NULL, finished_at DATETIME(3) NULL, migration_name VARCHAR(255) NOT NULL,
  logs TEXT NULL, rolled_back_at DATETIME(3) NULL, started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  applied_steps_count INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`;

type Row = { migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null };

export async function migrationStatus(): Promise<{ dir: string | null; migrations: MigrationInfo[] }> {
  const dir = migrationsDir();
  if (!dir) return { dir, migrations: [] };
  const local = await localMigrations(dir);
  const conn = await connect();
  try {
    const exists = ((await conn.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations'")) as Array<{ n: number }>)[0]!.n > 0;
    const rows: Row[] = exists ? await conn.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations") : [];
    return {
      dir,
      migrations: local.map((m) => {
        const r = rows.filter((x) => x.migration_name === m.name && !x.rolled_back_at);
        const done = r.find((x) => x.finished_at);
        const state = done ? (done.checksum === m.checksum ? "applied" : "modified") : r.length ? "failed" : "pending";
        return { name: m.name, checksum: m.checksum, state };
      }),
    };
  } finally {
    await conn.end();
  }
}

/** Applies every pending migration in order. Serialised with a named lock. */
export async function applyPendingMigrations(): Promise<{ applied: string[]; message: string }> {
  const dir = migrationsDir();
  if (!dir) throw new Error("The prisma/migrations folder is not included in this deployment.");
  const local = await localMigrations(dir);
  const conn = await connect(true);
  const applied: string[] = [];
  try {
    const lock = ((await conn.query("SELECT GET_LOCK('webcenta_migrate', 30) AS ok")) as Array<{ ok: number }>)[0];
    if (lock?.ok !== 1) throw new Error("Another migration is running. Try again in a minute.");
    await conn.query(ENSURE_TABLE);
    const rows: Row[] = await conn.query("SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations");
    const failed = rows.find((r) => !r.finished_at && !r.rolled_back_at);
    if (failed) throw new Error(`Migration ${failed.migration_name} failed earlier and must be resolved first (see docs/DATABASE.md).`);
    for (const m of local) {
      if (rows.some((r) => r.migration_name === m.name && r.finished_at && !r.rolled_back_at)) continue;
      const id = randomUUID();
      await conn.query("INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, UTC_TIMESTAMP(3), 0)", [id, m.checksum, m.name]);
      try {
        await conn.query(m.sql);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 4000);
        await conn.query("UPDATE _prisma_migrations SET logs = ? WHERE id = ?", [msg, id]).catch(() => undefined);
        throw new Error(`Migration ${m.name} failed: ${msg.slice(0, 300)}`);
      }
      await conn.query("UPDATE _prisma_migrations SET finished_at = UTC_TIMESTAMP(3), applied_steps_count = 1 WHERE id = ?", [id]);
      applied.push(m.name);
    }
    return { applied, message: applied.length ? `Applied ${applied.length} migration(s): ${applied.join(", ")}.` : "The database is up to date." };
  } finally {
    await conn.query("SELECT RELEASE_LOCK('webcenta_migrate')").catch(() => undefined);
    await conn.end();
  }
}
