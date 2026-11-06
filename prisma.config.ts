import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (migrate, db push, studio).
// * DIRECT_URL — used by the CLI when set. On Supabase use the *session* pooler
//   (port 5432) or the direct connection: migrations need session features
//   (advisory locks) that the transaction pooler (port 6543) does not provide.
// * DATABASE_URL — runtime connection used by the app (src/server/db.ts).
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
