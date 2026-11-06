import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 configuration. The connection URL is read from the environment
// (never hard-coded) so the same code runs on Hostinger, a VPS or any cloud.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
