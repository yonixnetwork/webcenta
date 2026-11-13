import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { saveSection } from "@/server/settings/store";
import { notify, notifyNewApp, notifySavedAppUpdated, sendInactivityReminders } from "@/server/community/notifications";
import { refreshVisitCounts } from "@/server/analytics/stats";
import { isListingTeam } from "@/server/analytics/events";
import { bulkPublish } from "@/server/importer/bulk";
import { listingInputSchema } from "@/server/listings/input";

const T = Date.now().toString(36);
let adminId: string;

/** A published listing in a category (created directly; the workflow is covered elsewhere). */
async function listing(name: string, categorySlug: string, extra: Record<string, unknown> = {}) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: categorySlug } });
  return db.listing.create({
    data: {
      slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${T}`, name, description: "An engagement test application with a long enough description.",
      websiteUrl: `https://${name.toLowerCase().replace(/\W+/g, "")}-${T}.example/`, domain: `${name.toLowerCase().replace(/\W+/g, "")}-${T}.example`,
      publisherName: "Test", primaryCategoryId: cat.id, status: "PUBLISHED", publishedAt: new Date(), source: "EDITORIAL",
      categories: { create: { categoryId: cat.id, isPrimary: true } }, ...extra,
    },
  });
}

beforeAll(async () => {
  const admin = await db.adminUser.create({ data: { email: `eng-admin-${T}@example.test`, name: "Eng", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: "x" } });
  adminId = admin.id;
  // No outbound push requests from tests: notifications stay in-app.
  await saveSection("engagement", { values: { pushEvents: "off" } }, { adminId });
});

describe("notifications", () => {
  it("notifies interested users about a new app once a day, respecting their age and preferences", async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
    const fan = await db.user.create({ data: { email: `fan-${T}@example.test`, name: "Fan", interests: { create: { categoryId: cat.id, weight: 5, source: "EXPLICIT" } } } });
    const optedOut = await db.user.create({ data: { email: `out-${T}@example.test`, name: "Out", notifyNewApps: false, interests: { create: { categoryId: cat.id, weight: 5, source: "EXPLICIT" } } } });
    const l = await listing("Notes Alpha", "productivity-notes");
    expect(await notifyNewApp(l.id)).toBeGreaterThanOrEqual(1);
    const n = await db.notification.findMany({ where: { userId: fan.id, type: "NEW_APP" } });
    expect(n).toHaveLength(1);
    expect(n[0]!.linkPath).toBe(`/app/${l.slug}`);
    expect(await db.notification.count({ where: { userId: optedOut.id } })).toBe(0);
    const l2 = await listing("Notes Beta", "productivity-notes");
    await notifyNewApp(l2.id);
    expect(await db.notification.count({ where: { userId: fan.id, type: "NEW_APP" } })).toBe(1); // at most one a day
  });

  it("tells users who saved an app that it was updated, at most once a week", async () => {
    const l = await listing("Saved Gamma", "productivity-notes");
    const u = await db.user.create({ data: { email: `saver-${T}@example.test`, name: "Saver", favorites: { create: { listingId: l.id } } } });
    await notifySavedAppUpdated(l.id);
    await notifySavedAppUpdated(l.id);
    expect(await db.notification.count({ where: { userId: u.id, type: "APP_UPDATE" } })).toBe(1);
  });

  it("sends an inactivity reminder only to push users who were away, only when there is something new, and not twice without a visit", async () => {
    const away = new Date(Date.now() - 3 * 86_400_000);
    const u = await db.user.create({ data: { email: `away-${T}@example.test`, name: "Away", lastSeenAt: away } });
    const noPush = await db.user.create({ data: { email: `nopush-${T}@example.test`, name: "NoPush", lastSeenAt: away } });
    await db.pushSubscription.create({ data: { endpointHash: `${T}`.padEnd(64, "a"), endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "x", auth: "y", userId: u.id } });
    await listing("Fresh Delta", "productivity-notes");
    await sendInactivityReminders();
    expect(await db.notification.count({ where: { userId: u.id, type: "REMINDER" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: noPush.id, type: "REMINDER" } })).toBe(0);
    await sendInactivityReminders(new Date(Date.now() + 8 * 86_400_000));
    expect(await db.notification.count({ where: { userId: u.id, type: "REMINDER" } })).toBe(1); // no visit since the last one
  });

  it("security notices are created even when push copies are off", async () => {
    const u = await db.user.create({ data: { email: `sec-${T}@example.test`, name: "Sec", pushNotifications: false } });
    await notify(u.id, { type: "SECURITY_NOTICE", title: "Your password was changed", email: false });
    expect(await db.notification.count({ where: { userId: u.id, type: "SECURITY_NOTICE" } })).toBe(1);
  });
});

describe("visit counter", () => {
  it("sums daily unique outbound clicks into the listing's public total", async () => {
    const l = await listing("Visits Epsilon", "productivity-notes");
    await db.listingDailyStat.createMany({ data: [
      { listingId: l.id, date: new Date("2026-01-01T00:00:00Z"), views: 900, uniqueVisitors: 700, outboundClicks: 400, uniqueOutboundClicks: 300 },
      { listingId: l.id, date: new Date("2026-01-02T00:00:00Z"), views: 800, uniqueVisitors: 600, outboundClicks: 350, uniqueOutboundClicks: 250 },
    ] });
    await refreshVisitCounts();
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).visitCount).toBe(550);
  });

  it("recognises the listing's own developers (their views and clicks are not counted)", async () => {
    const dev = await db.user.create({ data: { email: `team-${T}@example.test`, name: "Team" } });
    const other = await db.user.create({ data: { email: `visitor-${T}@example.test`, name: "Visitor" } });
    const org = await db.developerOrg.create({ data: { slug: `team-${T}`, displayName: "Team", members: { create: { userId: dev.id, role: "EDITOR" } } } });
    const l = await listing("Team Zeta", "productivity-notes", { developerId: org.id, source: "DEVELOPER_SUBMITTED" });
    expect(await isListingTeam(l.id, dev.id)).toBe(true);
    expect(await isListingTeam(l.id, other.id)).toBe(false);
    expect(await isListingTeam(l.id, null)).toBe(false);
  });
});

describe("bulk publishing of imports", () => {
  it("publishes only eligible imports: finished checks without failures, outside licence-evidence categories", async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
    const make = async (name: string, verdict: "PASS" | "FAIL" | null) => {
      const input = listingInputSchema.parse({ name, description: "An imported test application with a long enough description.", features: [], websiteUrl: `https://${name.toLowerCase()}-${T}.example/`,
        publisherName: "Pub", primaryCategoryId: cat.id, categoryIds: [], tags: [], pricingModel: "UNKNOWN", platforms: ["WEB"], isBrowserBased: true, ageRating: "ALL_AGES", supportedCountries: [], languages: [], screenshotAssetIds: [] });
      const l = await db.listing.create({ data: { slug: `${name.toLowerCase()}-${T}`, name, description: input.description, websiteUrl: input.websiteUrl, domain: `${name.toLowerCase()}-${T}.example`, publisherName: "Pub", primaryCategoryId: cat.id, status: "UNDER_REVIEW", source: "EDITORIAL",
        revisions: { create: { revisionNumber: 1, status: "UNDER_REVIEW", submittedAt: new Date(), data: input } } } });
      if (verdict) await db.securityScan.create({ data: { listingId: l.id, trigger: "SUBMISSION", status: "COMPLETED", overallVerdict: verdict, riskScore: verdict === "PASS" ? 0 : 80, targetUrl: input.websiteUrl, completedAt: new Date() } });
      return db.importCandidate.create({ data: { urlHash: `${name}${T}`.padEnd(64, "0").slice(0, 64), url: input.websiteUrl, domain: l.domain, status: "IMPORTED", listingId: l.id } });
    };
    const good = await make("Goodimport", "PASS");
    const bad = await make("Badimport", "FAIL");
    const unscanned = await make("Unscanned", null);
    const r = await bulkPublish(adminId, [good.id, bad.id, unscanned.id]);
    expect(r.done).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(["a security check failed", "security checks have not finished"]));
    const status = async (c: { listingId: string | null }) => (await db.listing.findUniqueOrThrow({ where: { id: c.listingId! } })).status;
    expect(await status(good)).toBe("PUBLISHED");
    expect(await status(bad)).toBe("UNDER_REVIEW");
    expect(await status(unscanned)).toBe("UNDER_REVIEW");
    expect(await db.auditLog.count({ where: { action: "imports.bulk-publish", adminId } })).toBe(1);
  });
});
