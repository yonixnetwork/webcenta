import { describe, expect, it } from "vitest";
import { db, IntegrityError } from "@/server/db";
import { searchListings } from "@/server/search/search";
import { parseFilters } from "@/lib/search-params";

const anon = { country: null, maxAgeRating: "AGE_16_PLUS", adultConfirmed: false, userId: null } as never;

describe("database safety (MySQL / MariaDB)", () => {
  it("uses InnoDB and utf8mb4 for every table", async () => {
    const rows = await db.$queryRaw<Array<{ TABLE_NAME: string; ENGINE: string; TABLE_COLLATION: string }>>`
      SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;
    expect(rows.length).toBeGreaterThanOrEqual(61);
    expect(rows.filter((r) => r.ENGINE !== "InnoDB" || !r.TABLE_COLLATION.startsWith("utf8mb4"))).toEqual([]);
  });

  it("compares secrets and opaque keys exactly (binary collation)", async () => {
    const rows = await db.$queryRaw<Array<{ t: string; c: string; coll: string }>>`
      SELECT TABLE_NAME t, COLUMN_NAME c, COLLATION_NAME coll FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND (TABLE_NAME, COLUMN_NAME) IN
        (('Session','token'), ('AdminSession','tokenHash'), ('AdminInvitation','tokenHash'), ('Verification','identifier'), ('MediaAsset','storageKey'))`;
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.coll === "utf8mb4_bin")).toBe(true);
  });

  it("enforces CHECK constraints (case-sensitive patterns)", async () => {
    const l = await db.listing.findFirstOrThrow({ select: { id: true } });
    await expect(db.$executeRaw`UPDATE Listing SET websiteUrl = 'http://insecure.example' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE Listing SET websiteUrl = 'HTTPS://upper.example' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE Listing SET slug = 'Bad Slug' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE Listing SET slug = 'Upper' WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE Listing SET ratingAverage = 5.5 WHERE id = ${l.id}`).rejects.toThrow();
    await expect(db.geoRestriction.create({ data: { listingId: l.id, countryCode: "us", reason: "lower-case code" } })).rejects.toThrow();
  });

  it("enforces rules CHECK cannot express on foreign keys, in the client extension", async () => {
    const l = await db.listing.findFirstOrThrow({ select: { id: true, primaryCategoryId: true } });
    await expect(db.geoRestriction.create({ data: { countryCode: "US", reason: "no target" } })).rejects.toBeInstanceOf(IntegrityError);
    await expect(db.geoRestriction.create({ data: { countryCode: "US", reason: "two targets", listingId: l.id, categoryId: l.primaryCategoryId! } })).rejects.toBeInstanceOf(IntegrityError);
    const cat = await db.category.findFirstOrThrow({ select: { id: true } });
    await expect(db.category.update({ where: { id: cat.id }, data: { parentId: cat.id } })).rejects.toBeInstanceOf(IntegrityError);
    // A valid restriction still works.
    const ok = await db.geoRestriction.create({ data: { listingId: l.id, countryCode: "ZZ", reason: "test" } });
    await db.geoRestriction.delete({ where: { id: ok.id } });
  });

  it("maintains the FULLTEXT search document on create and update", async () => {
    const l = await db.listing.findUniqueOrThrow({ where: { slug: "sample-lumen-notes" } });
    expect(l.searchText).toMatch(/backlinks/i);
    const [hit] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) n FROM Listing WHERE id = ${l.id} AND MATCH(searchText) AGAINST ('+backlink*' IN BOOLEAN MODE)`;
    expect(Number(hit?.n)).toBe(1);
    // Partial update of one source field recomputes from the full row.
    await db.listing.update({ where: { id: l.id }, data: { tagline: "Zettelkasten quasarwidget notes" } });
    const after = await db.listing.findUniqueOrThrow({ where: { id: l.id }, select: { searchText: true, name: true } });
    expect(after.searchText).toContain("quasarwidget");
    expect(after.searchText).toContain(after.name);
    expect((await searchListings(anon, parseFilters({ q: "quasarwidget" }))).items.map((i) => i.slug)).toEqual(["sample-lumen-notes"]);
    await db.listing.update({ where: { id: l.id }, data: { tagline: l.tagline } });
  });

  it("filters JSON array columns (platforms, supported countries)", async () => {
    const ext = await db.listing.count({ where: { platforms: { array_contains: ["BROWSER_EXTENSION"] } } });
    const all = await db.listing.count();
    expect(ext).toBeGreaterThan(0);
    expect(ext).toBeLessThan(all);
    const worldwide = await db.listing.count({ where: { supportedCountries: { equals: [] } } });
    expect(worldwide).toBeGreaterThan(0);
  });

  it("stores timestamps in UTC", async () => {
    const [r] = await db.$queryRaw<Array<{ tz: string; drift: number | bigint }>>`
      SELECT @@session.time_zone tz, TIMESTAMPDIFF(SECOND, NOW(), UTC_TIMESTAMP()) drift`;
    expect(r?.tz).toBe("+00:00");
    expect(Number(r?.drift)).toBe(0);
    const before = Date.now();
    const j = await db.jobRun.create({ data: { runner: "tz-test" } });
    expect(Math.abs(j.startedAt.getTime() - before)).toBeLessThan(60_000);
    await db.jobRun.delete({ where: { id: j.id } });
  });
});
