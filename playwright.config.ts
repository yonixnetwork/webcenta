import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.E2E_PORT ?? 3100);
/** Dual-stack ("::") where IPv6 exists, so "localhost" works whether it resolves to ::1 or 127.0.0.1. */
const HOST = Object.values(os.networkInterfaces()).flat().some((i) => i?.family === "IPv6" && i.internal) ? "::" : "0.0.0.0";
const DB = process.env.E2E_DATABASE_URL;
if (!DB) throw new Error("Set E2E_DATABASE_URL to a disposable test database (see tests/e2e/prepare.sh)");

/** Environment for the app under test: isolated DB, log-only email, local storage, test scanner mode. */
export const appEnv = {
  NODE_ENV: "production",
  DATABASE_URL: DB,
  DIRECT_URL: "",
  PUBLIC_ORIGIN: `http://localhost:${PORT}`,
  ADMIN_ORIGIN: `http://admin.localhost:${PORT}`,
  DEVELOPER_ORIGIN: `http://developers.localhost:${PORT}`,
  CRON_SECRET: process.env.CRON_SECRET ?? "e2e-only-cron-secret-0123456789abcdef0123",
  USER_AUTH_SECRET: "e2e-only-user-auth-secret-0123456789abcdef",
  ADMIN_AUTH_SECRET: "e2e-only-admin-auth-secret-0123456789abcdef",
  FIELD_ENCRYPTION_KEY: "ZTJlLW9ubHktZmllbGQtZW5jcnlwdGlvbi1rZXkhIQ==",
  EMAIL_TRANSPORT: "log",
  STORAGE_DRIVER: "local",
  // Absolute and outside the app, as production requires.
  STORAGE_LOCAL_DIR: path.resolve(".e2e-storage"),
  SCANNER_ALLOW_PRIVATE_FOR_TESTS: "true",
  ENABLE_TEST_ERROR_ROUTES: "true",
  NODE_EXTRA_CA_CERTS: path.resolve("tests/fixtures/.certs/ca.pem"),
  GEO_UNKNOWN_POLICY: "deny",
  ALLOW_DEV_FIXTURES: "",
};
for (const [k, v] of Object.entries(appEnv)) process.env[`APP_${k}`] = v;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`, trace: "off", ignoreHTTPSErrors: true,
    // The cookie question is answered ("necessary only") so its dialog does not cover the pages
    // under test; tests/e2e/consent.spec.ts covers the dialog itself with an empty browser.
    storageState: { cookies: ["localhost", "developers.localhost"].map((domain) => ({ name: "wc-consent", value: "v1.a0.d0", domain, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const })), origins: [] },
  },
  projects: [
    { name: "journeys", testMatch: /journeys\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "desktop", testMatch: /(marketplace|responsive|security|pwa|reviews|settings|hosts|consent|growth)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", testMatch: /(marketplace|responsive)\.spec\.ts/, use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium" } },
    { name: "mobile", testMatch: /(marketplace|responsive|pwa)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node tests/fixtures/site-server.mjs",
      url: "http://127.0.0.1:4599/health",
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      // The standalone server, exactly as Hostinger runs it (see scripts/prepare-standalone.mjs).
      command: `node .next/standalone/server.js`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { ...appEnv, PORT: String(PORT), HOSTNAME: HOST },
    },
  ],
});
