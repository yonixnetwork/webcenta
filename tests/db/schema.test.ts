import { describe, expect, it } from "vitest";
import { db } from "@/server/db";

describe("database safety (Supabase compatibility)", () => {
  it("has RLS enabled on every table in public", async () => {
    const rows = await db.$queryRaw<Array<{ relname: string }>>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
  it("installs pg_trgm in the extensions schema", async () => {
    const rows = await db.$queryRaw<Array<{ nspname: string }>>`
      SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`;
    expect(rows[0]?.nspname).toBe("extensions");
  });
  it("enforces CHECK constraints", async () => {
    const l = await db.listing.findFirstOrThrow({ select: { id: true } });
    await expect(db.$executeRaw`UPDATE "Listing" SET "websiteUrl" = 'http://insecure.example' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "Listing" SET slug = 'Bad Slug' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.geoRestriction.create({ data: { countryCode: "US", reason: "no target" } })).rejects.toThrow();
  });
  it("maintains the search vector via trigger", async () => {
    const l = await db.listing.findUniqueOrThrow({ where: { slug: "sample-lumen-notes" } });
    const [row] = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT "searchVector" @@ to_tsquery('simple', 'backlinks') AS ok FROM "Listing" WHERE id = ${l.id}`;
    expect(row?.ok).toBe(true);
  });
});
