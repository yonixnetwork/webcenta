import { beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { currentStep, encrypt, newTotpSecret, totpCode } from "@/server/admin/crypto";
import { requireStepUp, stepUpFresh, StepUpError } from "@/server/admin/step-up";
import { recordSecurityEvent, sendSecurityAlerts } from "@/server/security/events";
import { claimedCrawler, isVerifiedCrawler } from "@/server/security/bots";
import { rateLimit } from "@/server/rate-limit";
import { approvalEligibility, bulkModerate } from "@/server/listings/bulk-moderation";
import { approveRevision } from "@/server/listings/workflow";
import { listingInputSchema } from "@/server/listings/input";
import { changedFields, describeChanges, isMeaningful } from "@/server/listings/changes";
import { notifySavedAppUpdated } from "@/server/community/notifications";
import { cleanupImports } from "@/server/importer/cleanup";
import { feedPositions } from "@/server/ads/manager";

const T = Date.now().toString(36);
let admin: { id: string; email: string; name: string; role: "SUPER_ADMIN"; sessionId: string };
let secret: string;

beforeAll(async () => {
  secret = newTotpSecret();
  const a = await db.adminUser.create({ data: { email: `hard-${T}@example.test`, name: "Hard", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash: "x", totpSecretEnc: encrypt(secret), totpEnabledAt: new Date() } });
  const s = await db.adminSession.create({ data: { tokenHash: `${T}`.padEnd(64, "0"), adminId: a.id, expiresAt: new Date(Date.now() + 3600_000), mfaVerifiedAt: new Date() } });
  admin = { id: a.id, email: a.email, name: a.name, role: "SUPER_ADMIN", sessionId: s.id };
});

describe("step-up confirmation for sensitive admin actions", () => {
  it("requires a fresh authenticator code, rejects wrong or reused codes, and stays valid for 10 minutes", async () => {
    expect(await stepUpFresh(admin.sessionId)).toBe(false);
    await expect(requireStepUp(admin, null, "test")).rejects.toBeInstanceOf(StepUpError);
    await expect(requireStepUp(admin, "000000", "test")).rejects.toThrow(/wrong or was already used/);
    expect((await db.adminUser.findUniqueOrThrow({ where: { id: admin.id } })).failedLoginCount).toBe(1); // counts towards lockout
    const code = totpCode(secret, currentStep());
    await requireStepUp(admin, code, "test");
    expect(await stepUpFresh(admin.sessionId)).toBe(true);
    await requireStepUp(admin, null, "test"); // within the window: no code needed
    // A code is single-use even in a new session.
    await db.adminSession.update({ where: { id: admin.sessionId }, data: { stepUpAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(requireStepUp(admin, code, "test")).rejects.toThrow(/already used/);
    expect(await db.securityEvent.count({ where: { type: "admin.stepup.failed", source: admin.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "admin.step-up", adminId: admin.id } })).toBe(1);
  });
});

describe("security monitoring", () => {
  it("counts events per type, source and hour, and alerts once when a threshold is reached", async () => {
    const src = `203.0.113.${Number.parseInt(T.slice(-2), 36) % 250}`;
    for (let i = 0; i < 10; i++) await recordSecurityEvent("admin.login.failed", src, { severity: "warning" });
    const rows = await db.securityEvent.findMany({ where: { type: "admin.login.failed", source: src } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(10);
    const first = await sendSecurityAlerts();
    expect(first.alerted).toBeGreaterThanOrEqual(1);
    expect((await db.securityEvent.findFirstOrThrow({ where: { type: "admin.login.failed", source: src } })).alertedAt).not.toBeNull();
    const again = await sendSecurityAlerts();
    expect(again.alerted).toBe(0);
  });

  it("records the first denial of each rate-limit window", async () => {
    const key = `hard-test:${T}`;
    for (let i = 0; i < 5; i++) await rateLimit(key, 2, 60);
    const row = await db.securityEvent.findFirstOrThrow({ where: { type: "rate.limited", source: key } });
    expect(row.count).toBe(1);
  });

  it("only treats a crawler as verified when DNS confirms it (a user agent alone proves nothing)", async () => {
    expect(claimedCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).not.toBeNull();
    expect(claimedCrawler("Mozilla/5.0 Chrome/130")).toBeNull();
    expect(await isVerifiedCrawler("127.0.0.1", "Googlebot/2.1")).toBe(false);
  });
});

async function revision(name: string, opts: { status?: "UNDER_REVIEW" | "SUBMITTED"; scan?: "PASS" | "FAIL" | null; logo?: boolean; description?: string; published?: boolean } = {}) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
  const logo = opts.logo === false ? null : await db.mediaAsset.create({ data: { kind: "LOGO", storageKey: `test/${name}-${T}.webp`, mimeType: "image/webp", byteSize: 10, sha256: `${name}${T}`.padEnd(64, "0").slice(0, 64), moderationStatus: "APPROVED", uploadedByAdminId: admin.id } });
  const input = listingInputSchema.parse({ name, description: opts.description ?? "A hardening test application with a description that is clearly longer than eighty characters in total.", features: [], websiteUrl: `https://${name.toLowerCase()}-${T}.example/`,
    publisherName: "Pub", primaryCategoryId: cat.id, categoryIds: [], tags: [], pricingModel: "FREE", platforms: ["WEB"], isBrowserBased: true, ageRating: "ALL_AGES", supportedCountries: [], languages: [], screenshotAssetIds: [], ...(logo ? { logoAssetId: logo.id } : {}) });
  const l = await db.listing.create({ data: { slug: `${name.toLowerCase()}-${T}`, name, description: input.description, websiteUrl: input.websiteUrl, domain: `${name.toLowerCase()}-${T}.example`, publisherName: "Pub", primaryCategoryId: cat.id, status: opts.published ? "PUBLISHED" : "UNDER_REVIEW", publishedAt: opts.published ? new Date() : null, source: "EDITORIAL",
    revisions: { create: { revisionNumber: 1, status: opts.status ?? "UNDER_REVIEW", submittedAt: new Date(), data: input as Prisma.InputJsonValue } } }, include: { revisions: true } });
  if (opts.scan !== null) await db.securityScan.create({ data: { listingId: l.id, revisionId: l.revisions[0]!.id, trigger: "SUBMISSION", status: "COMPLETED", overallVerdict: opts.scan ?? "PASS", riskScore: 0, targetUrl: input.websiteUrl, completedAt: new Date() } });
  return { listing: l, rev: l.revisions[0]!, input };
}

describe("bulk moderation of submissions", () => {
  it("explains every ineligible record and approves only eligible ones", async () => {
    const ok = await revision("Eligiblehard");
    const pending = await revision("Pendinghard", { status: "SUBMITTED" });
    const failed = await revision("Failedhard", { scan: "FAIL" });
    const nologo = await revision("Nologohard", { logo: false });
    const short = await revision("Shorthard", { description: "Too short to be complete but valid." });
    const e = new Map((await approvalEligibility([ok.rev.id, pending.rev.id, failed.rev.id, nologo.rev.id, short.rev.id])).map((x) => [x.revisionId, x]));
    expect(e.get(ok.rev.id)).toMatchObject({ eligible: true });
    expect(e.get(pending.rev.id)?.reason).toBe("automated checks have not finished");
    expect(e.get(failed.rev.id)?.reason).toBe("a security check failed");
    expect(e.get(nologo.rev.id)?.reason).toMatch(/needs a logo/);
    expect(e.get(short.rev.id)?.reason).toMatch(/at least 80 characters/);
    const r = await bulkModerate(admin.id, "approve", [ok.rev.id, pending.rev.id, failed.rev.id, nologo.rev.id, short.rev.id], "");
    expect(r.done).toBe(1);
    expect(r.skipped).toHaveLength(4);
    expect((await db.listing.findUniqueOrThrow({ where: { id: ok.listing.id } })).status).toBe("PUBLISHED");
    expect((await db.listing.findUniqueOrThrow({ where: { id: failed.listing.id } })).status).toBe("UNDER_REVIEW");
    expect(await db.auditLog.count({ where: { action: "submissions.bulk-approve", adminId: admin.id } })).toBe(1);
  });

  it("rejects or asks for information with the reason; suspends only published listings", async () => {
    const a = await revision("Rejecthard");
    const b = await revision("Infohard");
    expect((await bulkModerate(admin.id, "reject", [a.rev.id], "Not a web application.")).done).toBe(1);
    expect((await db.listingRevision.findUniqueOrThrow({ where: { id: a.rev.id } })).status).toBe("REJECTED");
    expect((await bulkModerate(admin.id, "info", [b.rev.id], "Please add a privacy policy link.")).done).toBe(1);
    expect((await db.listingRevision.findUniqueOrThrow({ where: { id: b.rev.id } })).status).toBe("INFO_REQUIRED");
    const s = await bulkModerate(admin.id, "suspend", [b.rev.id], "Suspended for the test.");
    expect(s.done).toBe(0);
    expect(s.skipped[0]!.reason).toMatch(/only published listings/);
  });
});

describe("developer updates and saved-app notifications", () => {
  it("classifies changes: metadata is recorded but never notifies; visible changes do", () => {
    const base = { name: "A", tagline: null, description: "One two three four five six seven eight nine ten.", features: ["x"], websiteUrl: "https://a.example/", pricingModel: "FREE", pricingDetails: null, platforms: ["WEB"], ageRating: "ALL_AGES", logoAssetId: "l", screenshotAssetIds: ["s1"], tags: ["a"], languages: ["en"], supportedCountries: [] };
    expect(changedFields(base, { ...base, tags: ["a", "b"], languages: ["en", "fr"] })).toEqual(["tags", "languages"]);
    expect(isMeaningful(["tags", "languages"])).toBe(false);
    expect(changedFields(base, { ...base, description: "One two three four five six seven eight nine ten!" })).toEqual([]); // punctuation/typo
    const f = changedFields(base, { ...base, screenshotAssetIds: ["s1", "s2"], pricingModel: "FREEMIUM" });
    expect(f).toEqual(["pricing", "screenshots"]);
    expect(isMeaningful(f)).toBe(true);
    expect(describeChanges(f)).toBe("Updated pricing and screenshots.");
  });

  it("notifies people who saved the app once per meaningful update, with the developer's summary", async () => {
    const pub = await revision("Updatehard");
    await approveRevision(pub.rev.id, { type: "ADMIN", adminId: admin.id }, { publish: true }); // first publication (no update notification)
    expect(await db.job.count({ where: { dedupeKey: `notify.app-updated:${pub.rev.id}` } })).toBe(0);
    const fan = await db.user.create({ data: { email: `upd-${T}@example.test`, name: "Fan", favorites: { create: { listingId: pub.listing.id } } } });
    const meaningful = await db.listingRevision.create({ data: { listingId: pub.listing.id, revisionNumber: 2, status: "UNDER_REVIEW", submittedAt: new Date(), changeSummary: "New offline mode.", data: { ...pub.input, features: ["Offline mode"] } as Prisma.InputJsonValue } });
    await approveRevision(meaningful.id, { type: "ADMIN", adminId: admin.id }, { publish: true });
    const approved = await db.listingRevision.findUniqueOrThrow({ where: { id: meaningful.id } });
    expect(approved.changedFields).toEqual(["features"]);
    const job = await db.job.findFirstOrThrow({ where: { dedupeKey: `notify.app-updated:${meaningful.id}` } });
    expect(job.payload).toMatchObject({ listingId: pub.listing.id, revisionId: meaningful.id });
    expect(await notifySavedAppUpdated(pub.listing.id, meaningful.id)).toBe(1);
    expect(await notifySavedAppUpdated(pub.listing.id, meaningful.id)).toBe(0); // never twice
    const n = await db.notification.findFirstOrThrow({ where: { userId: fan.id, type: "APP_UPDATE" } });
    expect(n.body).toBe("An app in your saved list has been updated. New offline mode.");
    // A tags-only update is recorded but queues no notification.
    const trivial = await db.listingRevision.create({ data: { listingId: pub.listing.id, revisionNumber: 3, status: "UNDER_REVIEW", submittedAt: new Date(), data: { ...pub.input, features: ["Offline mode"], tags: ["notes"] } as Prisma.InputJsonValue } });
    await approveRevision(trivial.id, { type: "ADMIN", adminId: admin.id }, { publish: true });
    expect((await db.listingRevision.findUniqueOrThrow({ where: { id: trivial.id } })).changedFields).toEqual(["tags"]);
    expect(await db.job.count({ where: { dedupeKey: `notify.app-updated:${trivial.id}` } })).toBe(0);
  });
});

describe("import clean-up", () => {
  it("deletes only old duplicate and permanently failed queue entries without a listing, and logs it", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    const mk = (d: string, data: Record<string, unknown>) => db.importCandidate.create({ data: { urlHash: `${d}${T}`.padEnd(64, "0").slice(0, 64), url: `https://${d}-${T}.example/`, domain: `${d}-${T}.example`, processedAt: old, ...data } });
    const dup = await mk("olddup", { status: "SKIPPED", errorCategory: "duplicate", retryable: false });
    const fail = await mk("oldfail", { status: "FAILED", retryable: false, errorCategory: "not-found" });
    const retry = await mk("oldretry", { status: "FAILED", retryable: true, attempts: 1 });
    const recent = await db.importCandidate.create({ data: { urlHash: `recent${T}`.padEnd(64, "0").slice(0, 64), url: `https://recent-${T}.example/`, domain: `recent-${T}.example`, status: "SKIPPED", errorCategory: "duplicate", processedAt: new Date() } });
    const withListing = await revision("Keepcleanup");
    const kept = await mk("haslisting", { status: "SKIPPED", errorCategory: "duplicate", listingId: withListing.listing.id });
    const r = await cleanupImports();
    expect(r.duplicates).toBeGreaterThanOrEqual(1);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const left = new Set((await db.importCandidate.findMany({ where: { id: { in: [dup.id, fail.id, retry.id, recent.id, kept.id] } }, select: { id: true } })).map((x) => x.id));
    expect(left.has(dup.id)).toBe(false);
    expect(left.has(fail.id)).toBe(false);
    expect(left.has(retry.id)).toBe(true); // retryable and not out of attempts
    expect(left.has(recent.id)).toBe(true); // inside the retention period
    expect(left.has(kept.id)).toBe(true); // has a listing: never deleted
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "imports.cleanup" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(log.metadata)).toContain(`olddup-${T}.example`);
  });
});

describe("ad placement manager", () => {
  it("spaces feed ads by whole sections, never first or last, and caps them", () => {
    const order = ["home-native", "home-display", "banner"] as const;
    expect([...feedPositions(9, 3, 2, [...order]).entries()]).toEqual([[1, "home-native"], [4, "home-display"], [7, "banner"]]);
    expect([...feedPositions(9, 2, 2, [...order]).keys()]).toEqual([1, 4]); // page maximum
    expect([...feedPositions(4, 3, 2, [...order]).keys()]).toEqual([1]); // short page: one ad
    expect([...feedPositions(2, 3, 2, [...order]).keys()]).toEqual([]); // never after the last section
    expect([...feedPositions(12, 4, 3, [...order]).keys()]).toEqual([1, 5, 9]); // each placement once
  });
});
