/**
 * Runs once when each server process starts. Logs which startup variables the
 * process received (names only, never values) so the hosting runtime log shows
 * whether every process — including ones the web server starts on demand —
 * has its configuration.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { existsSync } = await import("node:fs");
  const path = await import("node:path");
  const required = ["DATABASE_URL", "FIELD_ENCRYPTION_KEY", "PUBLIC_ORIGIN", "NODE_ENV"];
  const missing = required.filter((k) => !process.env[k]);
  const snapshot = existsSync(path.join(process.cwd(), ".env.production"));
  console.log(
    `[webcenta] process start pid=${process.pid} node=${process.version} public=${process.env.PUBLIC_ORIGIN ?? "-"} ` +
      `admin=${process.env.ADMIN_ORIGIN ?? "(derived)"} developers=${process.env.DEVELOPER_ORIGIN ?? "(derived)"} ` +
      `startup-variables=${missing.length ? `MISSING ${missing.join(",")}` : "ok"} env-snapshot=${snapshot ? "present" : "absent"}`,
  );
  // Migrations + base data in the background (never blocks startup).
  const { startupTasks } = await import("./instrumentation-node");
  void startupTasks();
}
