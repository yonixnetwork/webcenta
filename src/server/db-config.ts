import type { PoolConfig } from "pg";

/**
 * Builds node-postgres pool options that work with Supabase (Supavisor pooler)
 * and with plain PostgreSQL on a VPS. Pure function — unit tested.
 *
 * Why strip sslmode from the URL: node-postgres lets connection-string SSL
 * parameters override the `ssl` object, so TLS is configured explicitly here.
 */
export interface DbEnv {
  DATABASE_URL: string;
  DATABASE_SSL?: "disable" | "require" | "verify-full";
  DATABASE_SSL_CA?: string;
  DATABASE_POOL_MAX?: number;
  NODE_ENV?: string;
}

const SSL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "pgbouncer", "connection_limit"];

export function isLocalDatabase(url: URL): boolean {
  const socketHost = url.searchParams.get("host");
  return (
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || Boolean(socketHost && socketHost.startsWith("/"))
  );
}

export function buildPoolConfig(e: DbEnv): { pool: PoolConfig; sslMode: string } {
  const url = new URL(e.DATABASE_URL);
  const urlSslMode = url.searchParams.get("sslmode");
  for (const p of SSL_PARAMS) url.searchParams.delete(p);

  const mode =
    e.DATABASE_SSL ??
    (urlSslMode === "disable" ? "disable" : urlSslMode === "require" ? "require" : undefined) ??
    (isLocalDatabase(url) ? "disable" : "verify-full");

  if (mode === "disable" && e.NODE_ENV === "production" && !isLocalDatabase(url)) {
    throw new Error("Refusing to connect to a remote database without TLS in production.");
  }

  const ca = e.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const ssl =
    mode === "disable"
      ? false
      : mode === "require"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ...(ca ? { ca } : {}) };

  const pool: PoolConfig = {
    connectionString: url.toString(),
    ssl,
    max: e.DATABASE_POOL_MAX ?? 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Supavisor transaction mode: keep statements short and avoid session state.
    statement_timeout: 15_000,
    application_name: "webcenter",
  };
  return { pool, sslMode: mode };
}
