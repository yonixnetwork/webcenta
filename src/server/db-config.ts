import type { PoolConfig } from "mariadb";

/**
 * Builds MySQL / MariaDB pool options from DATABASE_URL. Pure function — unit tested.
 *
 * Hostinger (managed hosting) runs MariaDB on the same machine as the Node.js app:
 * connect to host 127.0.0.1 (not "localhost": Node 17+ resolves that to ::1, which
 * the database user is not granted). Remote databases (a VPS, a managed MySQL)
 * must use TLS in production.
 */
export interface DbEnv {
  DATABASE_URL: string;
  DATABASE_SSL?: "disable" | "require" | "verify-full";
  DATABASE_SSL_CA?: string;
  DATABASE_POOL_MAX?: number;
  NODE_ENV?: string;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]"];

export function isLocalDatabase(url: URL): boolean {
  return LOCAL_HOSTS.includes(url.hostname) || Boolean(url.searchParams.get("socket"));
}

export function buildPoolConfig(e: DbEnv): { pool: PoolConfig; sslMode: "disable" | "require" | "verify-full" } {
  const url = new URL(e.DATABASE_URL);
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must start with mysql:// (MySQL / MariaDB).");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL must include the database name, e.g. mysql://user:pass@127.0.0.1:3306/u123_webcenta");

  const local = isLocalDatabase(url);
  const urlSsl = url.searchParams.get("sslmode") ?? url.searchParams.get("ssl-mode");
  const mode =
    e.DATABASE_SSL ??
    (urlSsl === "disable" || urlSsl === "DISABLED" ? "disable" : urlSsl === "require" || urlSsl === "REQUIRED" ? "require" : undefined) ??
    (local ? "disable" : "verify-full");

  if (mode === "disable" && e.NODE_ENV === "production" && !local) {
    throw new Error("Refusing to connect to a remote database without TLS in production.");
  }

  const ca = e.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const ssl = mode === "disable" ? undefined : mode === "require" ? { rejectUnauthorized: false } : { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
  const socketPath = url.searchParams.get("socket") ?? undefined;

  const pool: PoolConfig = {
    ...(socketPath ? { socketPath } : { host: url.hostname.replace(/^\[|\]$/g, ""), port: url.port ? Number(url.port) : 3306 }),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ...(ssl ? { ssl } : {}),
    // Shared hosting limits concurrent connections per database user; keep the pool small.
    connectionLimit: e.DATABASE_POOL_MAX ?? 5,
    connectTimeout: 10_000,
    acquireTimeout: 10_000,
    idleTimeout: 60,
    // Every timestamp is stored and read as UTC regardless of the server's time zone.
    timezone: "+00:00",
    // MySQL 8's default authentication needs the server key on non-TLS connections;
    // only allowed for local connections, where there is no network to intercept.
    allowPublicKeyRetrieval: local && mode === "disable",
    charset: "utf8mb4",
  };
  return { pool, sslMode: mode };
}
