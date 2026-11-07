import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { approveRevision, createDeveloperDraft, decideRevision, setListingStatus, submitRevision, WorkflowError } from "@/server/listings/workflow";
import { searchListings } from "@/server/search/search";
import { parseFilters } from "@/lib/search-params";
import { getPublicListing } from "@/server/catalog/listings";
import { replyToReview, ReviewError, upsertReview } from "@/server/community/reviews";
import { anon } from "./helpers";

const T = Date.now().toString(36);

async function setup() {
  const dev = await db.user.create({ data: { email: `wf-dev-${T}@example.test`, name: "Dev", emailVerified: true } });
  const org = await db.developerOrg.create({ data: { slug: `wf-${T}`, displayName: "WF Org", members: { create: { userId: dev.id, role: "OWNER" } } } });
  const cat = await db.category.findUniqueOrThrow({ where: { slug: "productivity-notes" } });
  const input = {
    name: `Workflow App ${T}`, description: "A workflow integration test application with enough description.", features: "One\nTwo",
    websiteUrl: `https://wf-${T}.example/`, publisherName: "WF Org", primaryCategoryId: cat.id, categoryIds: [], tags: "notes, test",
    pricingModel: "FREE", platforms: ["WEB"], isBrowserBased: "on", ageRating: "ALL_AGES", supportedCountries: "", languages: "en", screenshotAssetIds: [],
  };
  return { dev, org, input };
}

describe("listing workflow (integration)", () => {
  it("cannot submit without a verified domain; never publishes on submit", async () => {
    const { dev, org, input } = await setup();
    const l = await createDeveloperDraft(org.id, dev.id, input);
    expect(l.status).toBe("DRAFT");
    await expect(submitRevision(l.revisions[0]!.id, { type: "DEVELOPER", userId: dev.id })).rejects.toBeInstanceOf(WorkflowError);
    await db.domainVerification.create({ data: { orgId: org.id, domain: `wf-${T}.example`, method: "DNS_TXT", challenge: "x", status: "VERIFIED", verifiedAt: new Date() } });
    await submitRevision(l.revisions[0]!.id, { type: "DEVELOPER", userId: dev.id });
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("SUBMITTED");
    expect(await getPublicListing(anon(), l.slug)).toBeNull();
    expect(await db.job.count({ where: { dedupeKey: `submission.check:${l.revisions[0]!.id}` } })).toBe(1);

    // Info request → developer must revise; then approve → published with tags and categories, history recorded.
    await db.listingRevision.update({ where: { id: l.revisions[0]!.id }, data: { status: "UNDER_REVIEW" } });
    await expect(decideRevision(l.revisions[0]!.id, { type: "ADMIN" }, "INFO_REQUIRED", "")).rejects.toBeInstanceOf(WorkflowError);
    await decideRevision(l.revisions[0]!.id, { type: "ADMIN" }, "INFO_REQUIRED", "Please add a privacy policy");
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).status).toBe("INFO_REQUIRED");
    await db.listingRevision.update({ where: { id: l.revisions[0]!.id }, data: { status: "UNDER_REVIEW" } });
    await approveRevision(l.revisions[0]!.id, { type: "ADMIN" }, { publish: true });
    const live = await db.listing.findUniqueOrThrow({ where: { id: l.id }, include: { tags: true, categories: true, statusHistory: true } });
    expect(live.status).toBe("PUBLISHED");
    expect(live.tags).toHaveLength(2);
    expect(live.categories[0]?.isPrimary).toBe(true);
    expect(live.statusHistory.map((h) => h.toStatus)).toEqual(expect.arrayContaining(["DRAFT", "SUBMITTED", "INFO_REQUIRED", "PUBLISHED"]));
    expect(await getPublicListing(anon(), l.slug)).not.toBeNull();
    expect((await searchListings(anon(), parseFilters({ q: `Workflow App ${T}` }))).items.map((i) => i.id)).toContain(l.id);

    // Suspension removes it from every public surface; restore requires a reason.
    await expect(setListingStatus(l.id, "SUSPENDED", { type: "ADMIN" }, "")).rejects.toBeInstanceOf(WorkflowError);
    await setListingStatus(l.id, "SUSPENDED", { type: "ADMIN" }, "Test suspension");
    expect(await getPublicListing(anon(), l.slug)).toBeNull();
    expect((await searchListings(anon(), parseFilters({ q: `Workflow App ${T}` }))).items.map((i) => i.id)).not.toContain(l.id);
    await setListingStatus(l.id, "PUBLISHED", { type: "ADMIN" }, "Restored");
    expect(await getPublicListing(anon(), l.slug)).not.toBeNull();

    // Developers cannot review their own app; only org members (not analysts) can reply.
    await expect(upsertReview(anon(), dev.id, l.slug, { rating: 5 })).rejects.toBeInstanceOf(ReviewError);
    const u = await db.user.create({ data: { email: `wf-user-${T}@example.test`, name: "U", emailVerified: true, createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const { review, held } = await upsertReview(anon(), u.id, l.slug, { rating: 4, body: `Good app for workflows and notes overall (${T}).` });
    expect(held).toBe(false);
    expect((await db.listing.findUniqueOrThrow({ where: { id: l.id } })).ratingCount).toBe(1);
    const outsider = await db.user.create({ data: { email: `wf-out-${T}@example.test`, name: "O", emailVerified: true } });
    await expect(replyToReview(outsider.id, review.id, "Hi there")).rejects.toBeInstanceOf(ReviewError);
    await replyToReview(dev.id, review.id, "Thanks for the review!");
    expect(await db.notification.count({ where: { userId: u.id, type: "REVIEW_REPLY" } })).toBe(1);
  });
});
