import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { enqueueRecurring, runTick } from "@/server/jobs/runner";
import { handlers } from "@/server/jobs/handlers";
import { recordOutboundClick } from "@/server/analytics/outbound";
import { dailySalt, purgeOldSalts } from "@/server/analytics/visitor";
import { createListingReport } from "@/server/moderation/reports";
import { recordSearchStat } from "@/server/search/search";

describe("rate limiter", () => {
  it("allows up to the limit within a window", async () => {
    const key = `test:${Date.now()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results).toEqual([true, true, true, false]);
    await db.rateLimitBucket.delete({ where: { key } });
  });
});

describe("job runner", () => {
  it("enqueues recurring jobs once per window", async () => {
    await db.job.deleteMany({ where: { type: { startsWith: "maintenance." } } });
    const now = new Date();
    expect(await enqueueRecurring(now)).toBe(2);
    expect(await enqueueRecurring(now)).toBe(0);
  });
  it("runs due jobs and retries failures with backoff, then marks them dead", async () => {
    handlers["test.fail"] = async () => { throw new Error("boom"); };
    const failing = await db.job.create({ data: { type: "test.fail", payload: {}, maxAttempts: 2 } });
    const r1 = await runTick(5000);
    expect(r1.processed).toBeGreaterThanOrEqual(2); // the maintenance jobs
    let j = await db.job.findUniqueOrThrow({ where: { id: failing.id } });
    expect(j).toMatchObject({ status: "PENDING", attempts: 1, lastError: "boom" });
    expect(j.runAt.getTime()).toBeGreaterThan(Date.now());
    await db.job.update({ where: { id: j.id }, data: { runAt: new Date(0) } });
    await runTick(5000);
    j = await db.job.findUniqueOrThrow({ where: { id: failing.id } });
    expect(j.status).toBe("DEAD");
    const run = await db.jobRun.findUniqueOrThrow({ where: { id: r1.runId } });
    expect(run.finishedAt).not.toBeNull();
    await db.job.delete({ where: { id: j.id } });
    delete handlers["test.fail"];
  });
  it("reports unknown job types as failures instead of crashing", async () => {
    const j = await db.job.create({ data: { type: "does.not.exist", payload: {}, maxAttempts: 1 } });
    await runTick(5000);
    expect((await db.job.findUniqueOrThrow({ where: { id: j.id } })).status).toBe("DEAD");
    await db.job.delete({ where: { id: j.id } });
  });
});

describe("analytics privacy", () => {
  it("records outbound clicks without storing IP or user agent", async () => {
    const l = await db.listing.findUniqueOrThrow({ where: { slug: "sample-lumen-notes" } });
    const h = new Headers({ "x-forwarded-for": "203.0.113.77", "user-agent": "Mozilla/5.0 (iPhone) Mobile", "cf-ipcountry": "gb" });
    await recordOutboundClick(l.id, h, "detail");
    const e = await db.listingEvent.findFirstOrThrow({ where: { listingId: l.id }, orderBy: { id: "desc" } });
    expect(e).toMatchObject({ type: "OUTBOUND_CLICK", countryCode: "GB", device: "MOBILE", surface: "detail" });
    expect(JSON.stringify(e, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).not.toMatch(/203\.0\.113|iPhone/);
  });
  it("rotates and purges daily salts", async () => {
    const today = await dailySalt();
    expect(today.length).toBeGreaterThan(20);
    await db.systemSetting.create({ data: { key: "analytics.salt.2000-01-01", value: "old" } });
    expect(await purgeOldSalts(2)).toBeGreaterThanOrEqual(1);
    expect(await db.systemSetting.findUnique({ where: { key: "analytics.salt.2000-01-01" } })).toBeNull();
  });
  it("aggregates search terms but drops ones that may contain personal data", async () => {
    await recordSearchStat("Unit Test Query", 3);
    await recordSearchStat("unit test query", 0);
    await recordSearchStat("someone@example.com", 0);
    const row = await db.searchQueryDailyStat.findFirstOrThrow({ where: { query: "unit test query" } });
    expect(row).toMatchObject({ count: 2, zeroResults: 1 });
    expect(await db.searchQueryDailyStat.count({ where: { query: { contains: "@" } } })).toBe(0);
    await db.searchQueryDailyStat.deleteMany({ where: { query: "unit test query" } });
  });
});

describe("reports", () => {
  it("stores anonymous listing reports for moderation", async () => {
    const l = await db.listing.findUniqueOrThrow({ where: { slug: "sample-hookbin" } });
    const r = await createListingReport(l.id, { reason: "PHISHING", details: "test" });
    expect(await db.report.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "OPEN", reporterId: null, targetType: "LISTING" });
    await db.report.delete({ where: { id: r.id } });
  });
});
