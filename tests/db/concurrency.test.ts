import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { recordInteraction } from "@/server/personalization/signals";
import { dailySalt } from "@/server/analytics/visitor";
import { recordSearchStat } from "@/server/search/search";

/**
 * MySQL / MariaDB: Prisma runs upsert as read-then-insert, so concurrent upserts of
 * the same missing row race. These requests happen together in real use (a page
 * view and a "Save" click; the first visitors of a day; two people searching the
 * same words). Every call must succeed and every increment must be counted.
 */
const N = 12;
const email = `concurrency-${Date.now()}@example.test`;
const day = "2099-01-01";
// Letters only: the stats code drops queries with long numbers (possible personal data).
const phrase = `concurrency probe ${Date.now().toString(36).replace(/[0-9]/g, "x")}`;

afterAll(async () => {
  await db.user.deleteMany({ where: { email } });
  await db.systemSetting.deleteMany({ where: { key: `analytics.salt.${day}` } });
  await db.searchQueryDailyStat.deleteMany({ where: { query: phrase } });
});

describe("concurrent upserts (MySQL is not atomic)", () => {
  it("records every interaction and one interest row", async () => {
    const u = await db.user.create({ data: { email, name: "Concurrency", emailVerified: true } });
    const cat = await db.category.findFirstOrThrow({ select: { id: true } });
    await Promise.all(Array.from({ length: N }, () => recordInteraction(u.id, { type: "CATEGORY_VIEW", categoryId: cat.id })));
    expect(await db.interactionEvent.count({ where: { userId: u.id } })).toBe(N);
    const rows = await db.userInterest.findMany({ where: { userId: u.id, categoryId: cat.id } });
    expect(rows).toHaveLength(1);
    // One more single call tells us the per-call weight.
    const before = rows[0]!.weight;
    await recordInteraction(u.id, { type: "CATEGORY_VIEW", categoryId: cat.id });
    const after = (await db.userInterest.findFirstOrThrow({ where: { userId: u.id, categoryId: cat.id } })).weight;
    expect(before).toBeCloseTo((after - before) * N);
  });

  it("creates one daily salt that every concurrent caller agrees on", async () => {
    const salts = await Promise.all(Array.from({ length: N }, () => dailySalt(day)));
    expect(new Set(salts).size).toBe(1);
  });

  it("counts every concurrent search of the same words", async () => {
    await Promise.all(Array.from({ length: N }, () => recordSearchStat(phrase, 0)));
    const stat = await db.searchQueryDailyStat.findFirstOrThrow({ where: { query: phrase } });
    expect(stat.count).toBe(N);
    expect(stat.zeroResults).toBe(N);
  });
});
