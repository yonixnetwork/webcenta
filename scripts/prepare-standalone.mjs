// Completes Next.js standalone output (what Hostinger runs): the standalone
// server does not include static assets or public/ by design, so copy them in.
// Safe to run more than once; Hostinger may also do this itself.
import { cpSync, existsSync } from "node:fs";

if (!existsSync(".next/standalone/server.js")) {
  console.error("prepare-standalone: .next/standalone/server.js not found (is output: 'standalone' set?)");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
// Migrations, so first-time setup and Admin → Settings → Database can apply them.
cpSync("prisma/migrations", ".next/standalone/prisma/migrations", { recursive: true });
console.log("prepare-standalone: copied .next/static, public/ and prisma/migrations into .next/standalone");
