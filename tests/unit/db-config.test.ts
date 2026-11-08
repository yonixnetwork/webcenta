import { describe, expect, it } from "vitest";
import { buildPoolConfig } from "@/server/db-config";

const HOSTINGER = "mysql://u123456789_webcenta:p%40ss%3Aword@127.0.0.1:3306/u123456789_webcenta";

describe("buildPoolConfig (MySQL / MariaDB)", () => {
  it("parses a Hostinger-style URL (127.0.0.1, encoded password) without TLS", () => {
    const { pool, sslMode } = buildPoolConfig({ DATABASE_URL: HOSTINGER, NODE_ENV: "production" });
    expect(sslMode).toBe("disable");
    expect(pool).toMatchObject({ host: "127.0.0.1", port: 3306, user: "u123456789_webcenta", password: "p@ss:word", database: "u123456789_webcenta" });
    expect(pool.ssl).toBeUndefined();
  });
  it("always uses UTC, utf8mb4 and a small pool", () => {
    const { pool } = buildPoolConfig({ DATABASE_URL: HOSTINGER });
    expect(pool.timezone).toBe("+00:00");
    expect(pool.charset).toBe("utf8mb4");
    expect(pool.connectionLimit).toBe(5);
    expect(buildPoolConfig({ DATABASE_URL: HOSTINGER, DATABASE_POOL_MAX: 3 }).pool.connectionLimit).toBe(3);
  });
  it("verifies certificates for remote hosts by default, with an optional CA", () => {
    const { pool, sslMode } = buildPoolConfig({ DATABASE_URL: "mysql://u:p@db.example.com/x", DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----" });
    expect(sslMode).toBe("verify-full");
    expect(pool.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----" });
    expect(pool.allowPublicKeyRetrieval).toBe(false);
  });
  it("honours sslmode=require (encrypted, unverified)", () => {
    const r = buildPoolConfig({ DATABASE_URL: "mysql://u:p@db.example.com/x?sslmode=require" });
    expect(r.sslMode).toBe("require");
    expect(r.pool.ssl).toEqual({ rejectUnauthorized: false });
  });
  it("supports a Unix socket", () => {
    const { pool } = buildPoolConfig({ DATABASE_URL: "mysql://u:p@localhost/x?socket=/run/mysqld/mysqld.sock" });
    expect(pool.socketPath).toBe("/run/mysqld/mysqld.sock");
    expect(pool.host).toBeUndefined();
  });
  it("refuses plaintext to a remote database in production", () => {
    expect(() => buildPoolConfig({ DATABASE_URL: "mysql://u:p@db.example.com/x", DATABASE_SSL: "disable", NODE_ENV: "production" })).toThrow(/TLS/);
  });
  it("rejects non-MySQL URLs and URLs without a database name", () => {
    expect(() => buildPoolConfig({ DATABASE_URL: "postgresql://u:p@localhost:5432/x" })).toThrow(/mysql:\/\//);
    expect(() => buildPoolConfig({ DATABASE_URL: "mysql://u:p@127.0.0.1:3306/" })).toThrow(/database name/);
  });
});
