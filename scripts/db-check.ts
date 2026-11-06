/**
 * Database compatibility check — read-only. Run against Supabase (or any target)
 * BEFORE the first deployment:
 *   DATABASE_URL=... DIRECT_URL=... DATABASE_SSL_CA="$(cat supabase-ca.crt)" npm run db:check
 * Checks both connections, TLS, server version, extensions, RLS coverage,
 * Data API role privileges and migration status. Exits non-zero on failure.
 */
import "dotenv/config";
import pg from "pg";
import { buildPoolConfig } from "../src/server/db-config";

type Result = { name: string; ok: boolean; detail: string; warnOnly?: boolean };
const results: Result[] = [];
const add = (r: Result) => results.push(r);

async function probe(label: string, url: string | undefined) {
  if (!url) {
    add({ name: `${label}: configured`, ok: false, detail: "not set (migrations will use DATABASE_URL)", warnOnly: label === "DIRECT_URL" });
    return null;
  }
  const { pool, sslMode } = buildPoolConfig({
    DATABASE_URL: url,
    DATABASE_SSL: process.env.DATABASE_SSL as never,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    NODE_ENV: process.env.NODE_ENV,
  });
  const client = new pg.Client(pool);
  try {
    await client.connect();
    const v = await client.query<{ v: string; ssl: boolean | null }>(
      `SELECT current_setting('server_version') AS v,
              (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`,
    );
    const row = v.rows[0]!;
    const major = Number(row.v.split(".")[0]);
    add({ name: `${label}: connect`, ok: true, detail: `PostgreSQL ${row.v}, TLS mode "${sslMode}", session TLS: ${row.ssl ?? "unknown (pooler)"}` });
    add({ name: `${label}: version ≥ 15`, ok: major >= 15, detail: row.v });
    if (sslMode === "require") add({ name: `${label}: certificate verification`, ok: false, warnOnly: true, detail: "TLS without certificate verification — set DATABASE_SSL_CA for verify-full" });
    return client;
  } catch (e) {
    add({ name: `${label}: connect`, ok: false, detail: String(e instanceof Error ? e.message : e) });
    await client.end().catch(() => undefined);
    return null;
  }
}

async function main() {
  const runtime = await probe("DATABASE_URL", process.env.DATABASE_URL);
  const direct = await probe("DIRECT_URL", process.env.DIRECT_URL);
  const c = direct ?? runtime;
  if (c) {
    const ext = await c.query<{ extname: string; nspname: string }>(
      `SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`,
    );
    add({ name: "pg_trgm installed in schema 'extensions'", ok: ext.rows[0]?.nspname === "extensions",
      detail: ext.rows[0] ? `found in "${ext.rows[0].nspname}"` : "not installed (run migrations)", warnOnly: !ext.rows[0] });

    const mig = await c.query<{ n: string; failed: string }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS failed
       FROM _prisma_migrations`,
    ).catch(() => null);
    add({ name: "migrations applied", ok: Boolean(mig && Number(mig.rows[0]!.failed) === 0 && Number(mig.rows[0]!.n) > 0),
      detail: mig ? `${mig.rows[0]!.n} applied, ${mig.rows[0]!.failed} failed/rolled back` : "no _prisma_migrations table yet", warnOnly: !mig });

    const rls = await c.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`,
    );
    add({ name: "RLS enabled on every public table", ok: rls.rows.length === 0,
      detail: rls.rows.length ? `missing on: ${rls.rows.map((r) => r.relname).join(", ")}` : "all tables protected" });

    const grants = await c.query<{ grantee: string; n: string }>(
      `SELECT grantee, count(*) AS n FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') GROUP BY grantee`,
    );
    add({ name: "Supabase Data API roles have no table privileges", ok: grants.rows.length === 0,
      detail: grants.rows.length ? grants.rows.map((g) => `${g.grantee}: ${g.n} grants`).join(", ") : "none (or roles absent)" });
  }
  await runtime?.end();
  await direct?.end();

  let failed = 0;
  for (const r of results) {
    const tag = r.ok ? "PASS" : r.warnOnly ? "WARN" : "FAIL";
    if (tag === "FAIL") failed++;
    console.log(`${tag}  ${r.name} — ${r.detail}`);
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll required checks passed");
  process.exitCode = failed ? 1 : 0;
}

main();
