// Completes Next.js standalone output (what Hostinger runs): the standalone
// server does not include static assets or public/ by design, so copy them in.
// Safe to run more than once; Hostinger may also do this itself.
import { chmodSync, cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { snapshotLines } from "./env-snapshot.mjs";

if (!existsSync(".next/standalone/server.js")) {
  console.error("prepare-standalone: .next/standalone/server.js not found (is output: 'standalone' set?)");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
// Migrations, so first-time setup and Admin → Settings → Database can apply them.
cpSync("prisma/migrations", ".next/standalone/prisma/migrations", { recursive: true });
console.log("prepare-standalone: copied .next/static, public/ and prisma/migrations into .next/standalone");

/**
 * Environment snapshot. Hostinger runs the app under LiteSpeed (Passenger), which
 * can start extra app processes that do not receive the hPanel environment
 * variables (observed in production: requests failing with DATABASE_URL
 * undefined, and every hostname falling back to the public site because
 * PUBLIC_ORIGIN was missing). The build does receive them, so the app's own
 * variables are written to .env.production next to server.js, which Next.js
 * loads in every process. Variables set in the real environment still take
 * precedence. Only names listed in the configuration inventory are written,
 * the file is readable by the account owner only, and it lives outside the
 * web root. Set WEBCENTA_ENV_SNAPSHOT=false to disable.
 */
if (process.env.WEBCENTA_ENV_SNAPSHOT !== "false" && process.env.DATABASE_URL) {
  const inventory = JSON.parse(readFileSync("src/server/settings/env-inventory.json", "utf8"));
  const names = inventory.variables.filter((v) => v.required !== "never" && v.name !== "WEBCENTA_ENV_SNAPSHOT").map((v) => v.name);
  const lines = snapshotLines(process.env, names);
  const file = ".next/standalone/.env.production";
  writeFileSync(file, `# Generated at build time by scripts/prepare-standalone.mjs. Do not edit; change the hosting environment instead.\n${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`prepare-standalone: wrote ${lines.length} environment variable(s) to .next/standalone/.env.production (names: ${lines.map((l) => l.split("=")[0]).join(", ")})`);
} else {
  console.log("prepare-standalone: no environment snapshot (DATABASE_URL not set at build time, or WEBCENTA_ENV_SNAPSHOT=false)");
}
