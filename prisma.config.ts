import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (migrate, db push, studio).
// * DIRECT_URL — used by the CLI when set, e.g. Hostinger's Remote MySQL host when
//   running migrations from your own computer.
// * DATABASE_URL — otherwise; also the runtime connection (src/server/db.ts).
// Never hard-code connection strings; they come from the environment.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
