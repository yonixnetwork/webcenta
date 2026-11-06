import { describe, expect, it } from "vitest";
import { buildPoolConfig } from "@/server/db-config";

const SUPABASE_TX = "postgresql://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

describe("buildPoolConfig", () => {
  it("strips libpq SSL params and verifies certificates with a CA for Supabase", () => {
    const { pool, sslMode } = buildPoolConfig({ DATABASE_URL: SUPABASE_TX, DATABASE_SSL: "verify-full", DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nX\\n-----END CERTIFICATE-----" });
    expect(sslMode).toBe("verify-full");
    expect(pool.connectionString).not.toMatch(/sslmode|pgbouncer/);
    expect(pool.ssl).toEqual({ rejectUnauthorized: true, ca: "-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----" });
  });
  it("honours sslmode=require (encrypted, unverified) when no explicit mode is set", () => {
    const { pool, sslMode } = buildPoolConfig({ DATABASE_URL: SUPABASE_TX });
    expect(sslMode).toBe("require");
    expect(pool.ssl).toEqual({ rejectUnauthorized: false });
  });
  it("defaults to verify-full for remote hosts without sslmode", () => {
    expect(buildPoolConfig({ DATABASE_URL: "postgresql://u:p@db.example.com:5432/x" }).sslMode).toBe("verify-full");
  });
  it("disables TLS for local and socket connections", () => {
    expect(buildPoolConfig({ DATABASE_URL: "postgresql://u@localhost:5432/x" }).pool.ssl).toBe(false);
    expect(buildPoolConfig({ DATABASE_URL: "postgresql://u@localhost/x?host=/var/run/postgresql" }).sslMode).toBe("disable");
  });
  it("refuses plaintext to a remote database in production", () => {
    expect(() => buildPoolConfig({ DATABASE_URL: "postgresql://u:p@db.example.com/x", DATABASE_SSL: "disable", NODE_ENV: "production" })).toThrow();
  });
  it("keeps a small pool by default (shared hosting + pooler)", () => {
    expect(buildPoolConfig({ DATABASE_URL: SUPABASE_TX }).pool.max).toBe(5);
  });
});
