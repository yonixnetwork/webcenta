/**
 * Database compatibility check — read-only. Run against the target database
 * (Hostinger MariaDB, or any MySQL 8) BEFORE the first deployment:
 *   DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE" npm run db:check
 * Checks the server version and engine, character set, time zone handling,
 * FULLTEXT and SKIP LOCKED support, the privileges migrations need, connection
 * limits and migration status. Writes nothing. Exits non-zero on failure.
 */
import "dotenv/config";
import mariadb, { type Connection } from "mariadb";
import { buildPoolConfig } from "../src/server/db-config";

type Result = { name: string; ok: boolean; detail: string; warnOnly?: boolean };
const results: Result[] = [];
const add = (r: Result) => results.push(r);

/** Parses "10.11.6-MariaDB-…" / "8.0.36" into an engine and [major, minor]. */
export function parseVersion(v: string): { engine: "MariaDB" | "MySQL"; major: number; minor: number } {
  const [major = 0, minor = 0] = v.split(/[.-]/).map(Number);
  return { engine: /mariadb/i.test(v) ? "MariaDB" : "MySQL", major, minor };
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (mysql://USER:PASSWORD@HOST:3306/DATABASE).");
    process.exit(1);
  }
  const { pool, sslMode } = buildPoolConfig({
    DATABASE_URL: url,
    DATABASE_SSL: process.env.DATABASE_SSL as never,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    NODE_ENV: process.env.NODE_ENV,
  });
  let conn: Connection;
  try {
    conn = await mariadb.createConnection({ ...pool, bigIntAsNumber: true });
  } catch (e) {
    add({ name: "connect", ok: false, detail: (e as Error).message });
    return;
  }
  try {
    const one = async <T>(sql: string): Promise<T> => ((await conn.query(sql)) as T[])[0]!;
    const g = await one<Record<string, string | number | null>>(
      `SELECT VERSION() AS version, @@default_storage_engine AS engine, @@character_set_database AS charset,
              @@collation_database AS collation, @@session.time_zone AS tz, @@sql_mode AS sqlMode,
              @@max_connections AS maxConnections, @@max_user_connections AS maxUserConnections,
              @@max_allowed_packet AS maxPacket, @@innodb_ft_min_token_size AS ftMin, DATABASE() AS db`,
    );
    const v = parseVersion(String(g.version));
    add({ name: "connect", ok: true, detail: `${v.engine} ${g.version}, database "${g.db}", TLS mode "${sslMode}"` });
    const versionOk = v.engine === "MariaDB" ? v.major > 10 || (v.major === 10 && v.minor >= 6) : v.major >= 8;
    add({ name: "version (MariaDB ≥ 10.6 or MySQL ≥ 8.0)", ok: versionOk, detail: String(g.version) });
    add({ name: "storage engine InnoDB", ok: String(g.engine).toLowerCase() === "innodb", detail: String(g.engine) });
    add({ name: "database charset utf8mb4", ok: String(g.charset) === "utf8mb4", detail: `${g.charset} / ${g.collation}` });
    add({ name: "session time zone UTC", ok: ["+00:00", "UTC", "SYSTEM"].includes(String(g.tz)), detail: `${g.tz} (the app forces +00:00 per connection)`, warnOnly: true });
    add({ name: "strict SQL mode", ok: /STRICT_(TRANS|ALL)_TABLES/.test(String(g.sqlMode)), detail: String(g.sqlMode), warnOnly: true });
    add({ name: "FULLTEXT minimum token size ≤ 3", ok: Number(g.ftMin) <= 3, detail: `innodb_ft_min_token_size = ${g.ftMin} (search assumes 3)`, warnOnly: true });
    const userLimit = Number(g.maxUserConnections);
    add({
      name: "connection limit fits the pool",
      ok: userLimit === 0 || userLimit >= Number(process.env.DATABASE_POOL_MAX ?? 5) + 2,
      detail: `max_user_connections = ${userLimit || "unlimited"}, max_connections = ${g.maxConnections}, DATABASE_POOL_MAX = ${process.env.DATABASE_POOL_MAX ?? 5}`,
      warnOnly: true,
    });
    add({ name: "max_allowed_packet ≥ 4 MB", ok: Number(g.maxPacket) >= 4 * 1024 * 1024, detail: `${Math.round(Number(g.maxPacket) / 1024 / 1024)} MB` });

    // SKIP LOCKED is needed by the job queue; a read-only probe inside a rolled-back transaction.
    try {
      await conn.beginTransaction();
      await conn.query("SELECT 1 FROM DUAL FOR UPDATE SKIP LOCKED");
      add({ name: "FOR UPDATE SKIP LOCKED", ok: true, detail: "supported" });
    } catch (e) {
      add({ name: "FOR UPDATE SKIP LOCKED", ok: false, detail: (e as Error).message });
    } finally {
      await conn.rollback();
    }

    const grants = ((await conn.query("SHOW GRANTS FOR CURRENT_USER()")) as Array<Record<string, string>>).map((r) => Object.values(r)[0]!).join("\n");
    const needed = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "INDEX", "DROP", "REFERENCES"];
    const missing = /ALL PRIVILEGES/i.test(grants) ? [] : needed.filter((p) => !new RegExp(`\\b${p}\\b`, "i").test(grants));
    add({ name: "privileges for migrations", ok: missing.length === 0, detail: missing.length ? `missing: ${missing.join(", ")}` : "ok" });

    const tables = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")).n);
    if (tables === 0) {
      add({ name: "migrations", ok: true, detail: "empty database — run `npx prisma migrate deploy`", warnOnly: true });
    } else {
      const hasMigrations = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '_prisma_migrations'")).n) > 0;
      if (!hasMigrations) {
        add({ name: "migrations", ok: false, detail: `${tables} tables but no _prisma_migrations table — not a Webcenta database?` });
      } else {
        const m = await one<{ applied: number; failed: number }>(
          "SELECT SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied, SUM(finished_at IS NULL AND rolled_back_at IS NULL) AS failed FROM _prisma_migrations",
        );
        add({ name: "migrations applied", ok: Number(m.failed) === 0, detail: `${m.applied} applied, ${m.failed} failed` });
        const nonInno = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND ENGINE <> 'InnoDB'")).n);
        add({ name: "all tables InnoDB", ok: nonInno === 0, detail: nonInno ? `${nonInno} non-InnoDB table(s)` : `${tables} tables` });
        const ft = Number((await one<{ n: number }>("SELECT COUNT(DISTINCT INDEX_NAME) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Listing' AND INDEX_TYPE = 'FULLTEXT'")).n);
        add({ name: "search FULLTEXT indexes", ok: ft === 3, detail: `${ft} of 3` });
      }
    }
  } finally {
    await conn.end();
  }
}

main()
  .catch((e) => add({ name: "unexpected error", ok: false, detail: (e as Error).message }))
  .finally(() => {
    let failed = 0;
    for (const r of results) {
      const tag = r.ok ? "PASS" : r.warnOnly ? "WARN" : "FAIL";
      if (tag === "FAIL") failed++;
      console.log(`${tag}  ${r.name} — ${r.detail}`);
    }
    console.log(failed ? `\n${failed} check(s) failed` : "\nAll required checks passed");
    process.exit(failed ? 1 : 0);
  });
