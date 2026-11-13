import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Web push goes to a mock push service: no real network requests from tests.
const sendNotification = vi.fn();
vi.mock("web-push", async (orig) => {
  const actual = (await orig()) as { default: Record<string, unknown> };
  return { default: { ...actual.default, sendNotification: (...a: unknown[]) => sendNotification(...a) } };
});

import { db } from "@/server/db";
import { handlers, recurringJobs } from "@/server/jobs/handlers";
import { acquireTickLock, enqueueRecurring, releaseTickLock, runJobNow, runTick, setJobEnabled } from "@/server/jobs/runner";
import { categorize, saveSubscription, sendBatch, sendTestPush } from "@/server/push/push";
import { pushDiagnostics } from "@/server/push/diagnostics";
import { canonicalHost, equivalentHosts, findDuplicate, skipQueuedDuplicates } from "@/server/importer/dedupe";
import { bulkRetry } from "@/server/importer/bulk";
import { importCandidate, queueImports, fetchCategory } from "@/server/importer/importer";
import { approveRevision, WorkflowError } from "@/server/listings/workflow";
import { listingInputSchema } from "@/server/listings/input";
import { checkVerification, htmlFileName, startVerification, txtHostLabel } from "@/server/developer/domain-verification";
import { saveSection } from "@/server/settings/store";
import { resolvePlacement, adsterraFrameHtml, adsterraUnit } from "@/server/ads/placements";

const T = Date.now().toString(36);
let adminId: string;
const parked: Array<{ id: string; runAt: Date }> = [];

beforeAll(async () => {
  const admin = await db.adminUser.create({ data: { email: `repair-admin-${T}@example.test`, name: "Repair", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: "x" } });
  adminId = admin.id;
  // Keep other test files' queued jobs (scans that fetch websites) out of these scheduler runs.
  parked.push(...(await db.job.findMany({ where: { status: "PENDING" }, select: { id: true, runAt: true } })));
  await db.job.updateMany({ where: { id: { in: parked.map((p) => p.id) } }, data: { runAt: new Date(Date.now() + 86_400_000) } });
  for (const r of recurringJobs) await setJobEnabled(r.type, false);
  handlers["test.ok"] = async () => ({ processed: 3 });
  handlers["test.fail"] = async () => { throw new Error("deliberate failure for the test"); };
});

afterAll(async () => {
  for (const p of parked) await db.job.update({ where: { id: p.id }, data: { runAt: p.runAt } }).catch(() => undefined);
  await db.systemSetting.deleteMany({ where: { key: { in: ["jobs.disabled", "jobs.lock"] } } });
  await db.job.deleteMany({ where: { type: { startsWith: "test." } } });
  delete handlers["test.ok"]; delete handlers["test.fail"];
});

describe("scheduler", () => {
  it("runs due jobs, records results, durations, failures and the run itself", async () => {
    const ok = await db.job.create({ data: { type: "test.ok", payload: {}, priority: 100 } });
    const bad = await db.job.create({ data: { type: "test.fail", payload: {}, priority: 100, maxAttempts: 1 } });
    const r = await runTick(5_000, "cron");
    expect(r.skipped).toBeFalsy();
    expect(r.processed).toBeGreaterThanOrEqual(1);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const okDone = await db.job.findUniqueOrThrow({ where: { id: ok.id } });
    expect(okDone.status).toBe("SUCCEEDED");
    expect(okDone.result).toEqual({ processed: 3 });
    expect(okDone.startedAt).not.toBeNull();
    expect(okDone.durationMs).not.toBeNull();
    const badDone = await db.job.findUniqueOrThrow({ where: { id: bad.id } });
    expect(badDone.status).toBe("DEAD");
    expect(badDone.lastError).toContain("deliberate failure");
    const run = await db.jobRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(run.trigger).toBe("cron");
    expect(run.finishedAt).not.toBeNull();
    expect(run.processed).toBe(r.processed);
  });

  it("an overlapping invocation is skipped and recorded; the lease expires on its own", async () => {
    expect(await acquireTickLock("holder", 60_000)).toBe(true);
    const r = await runTick(2_000, "cron");
    expect(r.skipped).toBe(true);
    expect((await db.jobRun.findUniqueOrThrow({ where: { id: r.runId } })).skipped).toBe(true);
    expect(await acquireTickLock("other", 60_000)).toBe(false);
    await releaseTickLock("holder");
    expect(await acquireTickLock("short", 1)).toBe(true);
    await new Promise((res) => setTimeout(res, 20));
    expect(await acquireTickLock("after-expiry", 60_000)).toBe(true); // a crashed run never blocks for long
    await releaseTickLock("after-expiry");
  });

  it("two concurrent ticks never both work", async () => {
    const [a, b] = await Promise.all([runTick(1_000, "cron"), runTick(1_000, "cron")]);
    expect([a.skipped, b.skipped].filter(Boolean)).toHaveLength(1);
  });

  it("paused jobs are not scheduled; Run now runs the real handler and reports the outcome", async () => {
    // A scheduling window no earlier run of this test used.
    const when = new Date(Date.now() + (400 + (Date.now() % 100_000)) * 86_400_000);
    await setJobEnabled("maintenance.purge-raw-events", false);
    const before = await db.job.count({ where: { type: "maintenance.purge-raw-events" } });
    await enqueueRecurring(when);
    expect(await db.job.count({ where: { type: "maintenance.purge-raw-events" } })).toBe(before);
    await setJobEnabled("maintenance.purge-raw-events", true);
    await enqueueRecurring(when);
    expect(await db.job.count({ where: { type: "maintenance.purge-raw-events" } })).toBe(before + 1);
    await setJobEnabled("maintenance.purge-raw-events", false);
    await db.job.deleteMany({ where: { type: "maintenance.purge-raw-events", status: "PENDING", createdAt: { gte: new Date(Date.now() - 60_000) } } });

    const r = await runJobNow("users.purge-deleted", adminId);
    expect(r.ok).toBe(true);
    expect(r.result).toEqual({ count: expect.any(Number) });
    expect((await db.job.findUniqueOrThrow({ where: { id: r.jobId } })).status).toBe("SUCCEEDED");
    await expect(runJobNow("not.a.job", adminId)).rejects.toThrow(/Unknown scheduled job/);
  });
});

describe("web push delivery", () => {
  const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${T}-${n}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

  it("classifies push service answers precisely", () => {
    expect(categorize(201)).toEqual({ outcome: "ACCEPTED", category: null });
    expect(categorize(410).outcome).toBe("EXPIRED");
    expect(categorize(404).outcome).toBe("EXPIRED");
    expect(categorize(403).category).toBe("unauthorized");
    expect(categorize(429).category).toBe("rate-limited");
    expect(categorize(503).category).toBe("service-error");
    expect(categorize(undefined, "connect ETIMEDOUT").category).toBe("network");
  });

  it("links a subscription to the signed-in account and unlinks it after sign-out", async () => {
    const u = await db.user.create({ data: { email: `push-${T}@example.test`, name: "Push" } });
    const s = sub("link");
    await saveSubscription(s, u.id, "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", { standalone: true });
    let row = await db.pushSubscription.findFirstOrThrow({ where: { endpoint: s.endpoint } });
    expect(row.userId).toBe(u.id);
    expect(row.platform).toBe("android");
    expect(row.standalone).toBe(true);
    expect(row.lastSyncedAt).not.toBeNull();
    await saveSubscription(s, null, "Mozilla/5.0 (Linux; Android 14)");
    row = await db.pushSubscription.findFirstOrThrow({ where: { endpoint: s.endpoint } });
    expect(row.userId).toBeNull(); // a shared phone never gets the previous account's notifications
    // A replaced subscription (pushsubscriptionchange) removes the old endpoint.
    const s2 = sub("link-2");
    await saveSubscription(s2, u.id, "Android", { oldEndpoint: s.endpoint });
    expect(await db.pushSubscription.count({ where: { endpoint: s.endpoint } })).toBe(0);
  });

  it("sends with high urgency, records every attempt, and removes expired subscriptions", async () => {
    await saveSubscription(sub("ok"), null, "iPhone; CPU iPhone OS 17_0", { standalone: true });
    await saveSubscription(sub("gone"), null, "Android");
    await saveSubscription(sub("err"), null, "Windows NT 10.0");
    const subs = await db.pushSubscription.findMany({ where: { endpoint: { in: [sub("ok").endpoint, sub("gone").endpoint, sub("err").endpoint] } }, select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true, platform: true } });
    sendNotification.mockReset();
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("-gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("-err")) throw Object.assign(new Error("Received unexpected response code"), { statusCode: 500 });
      return { statusCode: 201 };
    });
    const campaign = await db.pushCampaign.create({ data: { title: "T", body: "B", url: "/" } });
    const r = await sendBatch(subs, { title: "Hello", body: "World", url: "/c/ai", tag: "wc-test1" }, { kind: "CAMPAIGN", campaignId: campaign.id });
    expect(r).toEqual({ delivered: 1, failed: 2, expired: 1 });
    const opts = sendNotification.mock.calls[0]![2] as { urgency: string; TTL: number };
    expect(opts.urgency).toBe("high");
    expect(opts.TTL).toBe(86_400);
    const payload = JSON.parse(sendNotification.mock.calls[0]![1] as string) as { url: string; badge: string; tag: string };
    expect(payload).toMatchObject({ url: "/c/ai", badge: "/icons/badge-96.png", tag: "wc-test1" });
    const log = await db.pushDelivery.findMany({ where: { campaignId: campaign.id } });
    expect(log.map((l) => l.outcome).sort()).toEqual(["ACCEPTED", "EXPIRED", "FAILED"]);
    expect(log.find((l) => l.outcome === "ACCEPTED")!.platform).toBe("ios");
    expect(await db.pushSubscription.count({ where: { endpoint: sub("gone").endpoint } })).toBe(0);
    const err = await db.pushSubscription.findFirstOrThrow({ where: { endpoint: sub("err").endpoint } });
    expect(err.failureCount).toBe(1);
    expect(err.lastStatus).toBe(500);
    expect(err.lastError).toMatch(/^service-error/);
    const d = await pushDiagnostics(1);
    expect(d.attempts).toBeGreaterThanOrEqual(3);
    expect(d.expired).toBeGreaterThanOrEqual(1);
    expect(d.categories.map((c) => c.category)).toEqual(expect.arrayContaining(["expired", "service-error"]));
  });

  it("a test notification goes only to the browser that asked, and reports the push service's answer", async () => {
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    expect(await sendTestPush("https://fcm.googleapis.com/fcm/send/unknown")).toEqual({ found: false });
    const r = await sendTestPush(sub("ok").endpoint);
    expect(r).toMatchObject({ found: true, accepted: true, outcome: "ACCEPTED", statusCode: 201 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe("imports: duplicates, claims, retries and publishing", () => {
  it("recognises the same website written differently", async () => {
    expect(canonicalHost("WWW.Example.com.")).toBe("example.com");
    expect(equivalentHosts("www.app.example.com")).toEqual(expect.arrayContaining(["app.example.com", "example.com", "www.example.com"]));
    // Different apps on a shared hosting platform stay distinct.
    expect(equivalentHosts("foo.vercel.app")).not.toContain("vercel.app");
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
    await db.listing.create({ data: { slug: `dup-${T}`, name: `Dup ${T}`, description: "x".repeat(40), websiteUrl: `https://dup-${T}.example/`, domain: `dup-${T}.example`, publisherName: "P", primaryCategoryId: cat.id, status: "PUBLISHED", source: "EDITORIAL" } });
    expect((await findDuplicate(`www.dup-${T}.example`))?.kind).toBe("listing");
    expect((await findDuplicate(`app.dup-${T}.example`))?.kind).toBe("listing");
    expect(await findDuplicate(`other-${T}.example`)).toBeNull();
  });

  it("skips queued imports of websites that are already listed or queued earlier", async () => {
    await queueImports(db, [{ url: `https://www.dup-${T}.example/pricing`, categorySlug: "productivity-notes" }, { url: `https://twin-${T}.example`, categorySlug: "productivity-notes" }]);
    await queueImports(db, [{ url: `https://www.twin-${T}.example/`, categorySlug: "productivity-notes" }]);
    const r = await skipQueuedDuplicates();
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    const rows = await db.importCandidate.findMany({ where: { domain: { in: [`www.dup-${T}.example`, `twin-${T}.example`, `www.twin-${T}.example`] } } });
    const by = (d: string) => rows.find((x) => x.domain === d)!;
    expect(by(`www.dup-${T}.example`)).toMatchObject({ status: "SKIPPED", failedStage: "duplicate", retryable: false });
    expect(by(`twin-${T}.example`).status).toBe("QUEUED"); // the first one keeps its place
    expect(by(`www.twin-${T}.example`).status).toBe("SKIPPED");
  });

  it("an import being processed cannot be started twice; failures say where and why; retry re-queues", async () => {
    await queueImports(db, [{ url: `https://claim-${T}.example`, categorySlug: "productivity-notes" }]);
    const c = await db.importCandidate.findFirstOrThrow({ where: { domain: `claim-${T}.example` } });
    await db.importCandidate.update({ where: { id: c.id }, data: { status: "IMPORTING" } });
    expect(await importCandidate(c.id)).toMatchObject({ status: "SKIPPED", reason: "This import is already being processed" });
    await db.importCandidate.update({ where: { id: c.id }, data: { status: "FAILED", lastError: "x", failedStage: "fetch", errorCategory: "timeout", retryable: true } });
    expect((await bulkRetry(adminId, [c.id])).done).toBe(1);
    expect(await db.importCandidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "QUEUED", lastError: null, failedStage: null });
    expect(fetchCategory(404, undefined)).toEqual({ category: "not-found", retryable: false });
    expect(fetchCategory(0, "Request timed out")).toEqual({ category: "timeout", retryable: true });
    expect(fetchCategory(503, undefined).retryable).toBe(true);
  });

  it("publishing is idempotent: two simultaneous approvals publish once", async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
    const input = listingInputSchema.parse({ name: `Once ${T}`, description: "An idempotency test application with a long enough description.", features: [], websiteUrl: `https://once-${T}.example/`, publisherName: "Pub", primaryCategoryId: cat.id, categoryIds: [], tags: [], pricingModel: "UNKNOWN", platforms: ["WEB"], isBrowserBased: true, ageRating: "ALL_AGES", supportedCountries: [], languages: [], screenshotAssetIds: [] });
    const l = await db.listing.create({ data: { slug: `once-${T}`, name: input.name, description: input.description, websiteUrl: input.websiteUrl, domain: `once-${T}.example`, publisherName: "Pub", primaryCategoryId: cat.id, status: "UNDER_REVIEW", source: "EDITORIAL", revisions: { create: { revisionNumber: 1, status: "UNDER_REVIEW", data: input } } }, include: { revisions: true } });
    const results = await Promise.allSettled([approveRevision(l.revisions[0]!.id, { type: "ADMIN", adminId }, { publish: true }), approveRevision(l.revisions[0]!.id, { type: "ADMIN", adminId }, { publish: true })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(WorkflowError);
    expect(await db.listingStatusChange.count({ where: { listingId: l.id, toStatus: "PUBLISHED" } })).toBe(1);
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("PUBLISHED");
  });
});

describe("domain verification", () => {
  it("issues unique codes with an HTML file name, explains the DNS host, and expires unproven codes", async () => {
    const org = await db.developerOrg.create({ data: { slug: `dv-${T}`, displayName: "DV" } });
    const a = await startVerification(org.id, `dv-${T}.example`, "HTML_FILE");
    const b = await startVerification(org.id, `dv-${T}.example`, "HTML_FILE");
    expect(a.challenge).not.toBe(b.challenge);
    expect(htmlFileName(a.challenge)).toMatch(/^webcenta-domain-verification-[0-9a-f]{16}\.html$/);
    expect(htmlFileName(a.challenge)).not.toBe(htmlFileName(b.challenge));
    expect(b.challengeExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    expect(txtHostLabel("example.com")).toEqual({ host: "@", zone: "example.com" });
    expect(txtHostLabel("app.example.com")).toEqual({ host: "app", zone: "example.com" });
    expect(txtHostLabel("shop.example.co.uk")).toEqual({ host: "shop", zone: "example.co.uk" });
    await db.domainVerification.update({ where: { id: b.id }, data: { challengeExpiresAt: new Date(Date.now() - 1000) } });
    const r = await checkVerification(b.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });
});

describe("ads: one provider per placement", () => {
  afterAll(async () => { await db.systemSetting.deleteMany({ where: { key: { in: ["config.ads", "config.adsterra", "config.adsense"] } } }); });

  it("uses Adsterra unless AdSense is approved and has a unit for the placement", async () => {
    await saveSection("adsterra", { enabled: true, values: {} }, { adminId });
    await saveSection("ads", { enabled: true, values: {} }, { adminId });
    expect(await resolvePlacement("home-display")).toMatchObject({ provider: "adsterra", unit: "300x250", width: 300, height: 250 });
    // A publisher ID alone does not make AdSense active.
    await saveSection("adsense", { enabled: true, values: { publisherId: "pub-1234567890123456" } }, { adminId });
    await saveSection("ads", { values: { adsenseSlotHomeDisplay: "1234567890" } }, { adminId });
    expect((await resolvePlacement("home-display"))!.provider).toBe("adsterra");
    await saveSection("ads", { values: { adsenseApproved: "on" } }, { adminId });
    const r = await resolvePlacement("home-display");
    expect(r).toMatchObject({ provider: "adsense", adsense: { client: "ca-pub-1234567890123456", slot: "1234567890" }, adsterra: { unit: "300x250" } });
    // Placements without an AdSense unit keep Adsterra; "Adsterra only" overrides.
    expect((await resolvePlacement("listing"))!.provider).toBe("adsterra");
    await saveSection("ads", { values: { preferredProvider: "adsterra" } }, { adminId });
    expect((await resolvePlacement("home-display"))!.provider).toBe("adsterra");
    // Wide units never load on phones.
    expect(await resolvePlacement("desktop-leaderboard")).toMatchObject({ minWidth: 1024 });
    expect(await resolvePlacement("desktop-sidebar")).toMatchObject({ minWidth: 1280 });
    expect(await resolvePlacement("mobile-compact")).toMatchObject({ maxWidth: 499 });
    await saveSection("ads", { values: { listing: "off" } }, { adminId });
    expect(await resolvePlacement("listing")).toBeNull();
  });

  it("each frame contains exactly the supplied Adsterra code for its unit", async () => {
    const native = adsterraFrameHtml((await adsterraUnit("native"))!, "https://webcenta.com");
    expect(native).toContain('<script async="async" data-cfasync="false" src="https://bauval.org/21/2551bb0538e1d6f96d5844f91de7e70d"></script>');
    expect(native).toContain('<div id="container-2551bb0538e1d6f96d5844f91de7e70d"></div>');
    const units: Array<[Parameters<typeof adsterraUnit>[0], string, number, number]> = [
      ["468x60", "c48a5f48afbd920b94c779e34cbe26f8", 60, 468], ["300x250", "71f63cdca7866f4ff5d8f2c07764ccdd", 250, 300], ["160x600", "8f136dfb344bddf64040a81be40b2730", 600, 160],
      ["728x90", "f66f57ed50fa3f1c7686f5fda2f6b167", 90, 728], ["320x50", "ce450a64b7d6fcc6866e4901d5e8153b", 50, 320],
    ];
    for (const [unit, key, h, w] of units) {
      const html = adsterraFrameHtml((await adsterraUnit(unit))!, "https://webcenta.com");
      expect(html).toContain(`atOptions = {\n'key' : '${key}',\n'format' : 'iframe',\n'height' : ${h},\n'width' : ${w},\n'params' : {}\n};`);
      expect(html).toContain(`<script src="https://bauval.org/22/${key}"></script>`);
      expect(html.match(/atOptions/g)).toHaveLength(1); // one unit per frame: no shared global
    }
    await saveSection("adsterra", { enabled: false, values: {} }, { adminId });
    expect(await adsterraUnit("300x250")).toBeNull();
  });
});
