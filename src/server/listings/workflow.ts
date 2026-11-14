import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ActorType, ListingStatus, RiskTier } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { slugify, normalizeWebsiteUrl } from "@/lib/url";
import { notifyOrg } from "@/server/community/notifications";
import { scanListing, qualifiesForAutoApproval, worst } from "@/server/scanner/scan";
import { nextScanDate, notifyAdmins } from "@/server/scanner/monitor";
import { orgOwnsDomain } from "@/server/developer/domain-verification";
import { invalidateCategoryCache } from "@/server/catalog/categories";
import { listingInputSchema, type ListingInput } from "./input";
import { developerPolicy } from "@/server/developer/policy";
import { queueIndexNow } from "@/server/settings/site";
import { getSection } from "@/server/settings/store";
import { importDecision, slugList } from "@/server/importer/policy";

export class WorkflowError extends Error {}

/** Queues the user notifications for a published/updated app (one job per app per hour). */
async function queueAppNotification(listingId: string, type: "notify.new-app" | "notify.app-updated", revisionId?: string) {
  const hour = new Date().toISOString().slice(0, 13);
  // One job per update (revision): approving it twice or a retry never notifies twice.
  const dedupeKey = revisionId ? `${type}:${revisionId}` : `${type}:${listingId}:${hour}`;
  await db.job.create({ data: { type, payload: { listingId, ...(revisionId ? { revisionId } : {}) }, dedupeKey } }).catch(() => undefined);
}
export interface Actor { type: ActorType; userId?: string; adminId?: string }

const RISK: RiskTier[] = ["LOW", "MEDIUM", "HIGH", "PROHIBITED"];

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name) || "app";
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i === 1 ? randomBytes(2).toString("hex") : randomBytes(3).toString("hex")}`;
    const hit = await db.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === excludeId) return slug;
  }
  throw new WorkflowError("Could not allocate a URL for this listing");
}

/** Validates referenced categories and media; returns derived classification. */
export async function validateRefs(input: ListingInput, uploader: { orgId?: string; adminId?: string }) {
  const catIds = [...new Set([input.primaryCategoryId, ...input.categoryIds])].slice(0, 5);
  const cats = await db.category.findMany({ where: { id: { in: catIds }, isEnabled: true, mergedIntoId: null }, include: { parent: true } });
  if (!cats.some((c) => c.id === input.primaryCategoryId)) throw new WorkflowError("Choose a valid primary category");
  const assetIds = [input.logoAssetId, ...input.screenshotAssetIds].filter(Boolean) as string[];
  if (assetIds.length) {
    const assets = await db.mediaAsset.findMany({ where: { id: { in: assetIds } } });
    const memberIds = uploader.orgId ? (await db.developerMember.findMany({ where: { orgId: uploader.orgId }, select: { userId: true } })).map((m) => m.userId) : [];
    for (const a of assets) {
      const ok = (a.uploadedByAdminId && uploader.adminId) || (a.uploadedByUserId && memberIds.includes(a.uploadedByUserId));
      if (!ok) throw new WorkflowError("Media must be uploaded by your organisation");
    }
    if (assets.length !== assetIds.length) throw new WorkflowError("Some media files were not found");
  }
  const tier = cats.flatMap((c) => [c.riskTier, c.parent?.riskTier ?? "LOW"]).reduce<RiskTier>((a, b) => (RISK.indexOf(b) > RISK.indexOf(a) ? b : a), "LOW");
  const manual = cats.some((c) => c.requiresManualReview || c.parent?.requiresManualReview) || tier === "HIGH";
  const compliance = cats.some((c) => c.requiresComplianceDocs || c.parent?.requiresComplianceDocs);
  return { categoryIds: cats.map((c) => c.id), riskTier: tier, manualReview: manual, complianceRequired: compliance };
}

async function statusChange(listingId: string, from: ListingStatus | null, to: ListingStatus, actor: Actor, reason?: string, tx: Prisma.TransactionClient | typeof db = db) {
  if (from === to) return;
  await tx.listingStatusChange.create({ data: { listingId, fromStatus: from, toStatus: to, actorType: actor.type, actorId: actor.adminId ?? actor.userId ?? null, reason: reason ?? null } });
}

/** Developer creates a draft listing (not public) with revision #1. */
export async function createDeveloperDraft(orgId: string, userId: string, raw: unknown) {
  const input = listingInputSchema.parse(raw);
  const { maxDraftsPerOrg } = await developerPolicy();
  const open = await db.listing.count({ where: { developerId: orgId, status: { in: ["DRAFT", "SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED"] } } });
  if (open >= maxDraftsPerOrg) throw new WorkflowError(`Your organisation already has ${open} unpublished listings (the limit is ${maxDraftsPerOrg}). Submit or delete some first.`);
  await validateRefs(input, { orgId });
  const url = normalizeWebsiteUrl(input.websiteUrl)!;
  const listing = await db.listing.create({
    data: {
      slug: await uniqueSlug(input.name), source: "DEVELOPER_SUBMITTED", status: "DRAFT", developerId: orgId,
      name: input.name, description: input.description, websiteUrl: url.toString(), domain: url.hostname, publisherName: input.publisherName,
      primaryCategoryId: input.primaryCategoryId,
      revisions: { create: { revisionNumber: 1, status: "DRAFT", data: input as Prisma.InputJsonValue, submittedById: userId } },
    },
    include: { revisions: true },
  });
  await statusChange(listing.id, null, "DRAFT", { type: "DEVELOPER", userId });
  return listing;
}

/** Creates or updates the editable (DRAFT / INFO_REQUIRED) revision of a listing. */
export async function saveRevision(listingId: string, raw: unknown, actor: Actor & { orgId?: string }) {
  const input = listingInputSchema.parse(raw);
  await validateRefs(input, { orgId: actor.orgId, adminId: actor.adminId });
  const open = await db.listingRevision.findFirst({ where: { listingId, status: { in: ["DRAFT", "INFO_REQUIRED"] } }, orderBy: { revisionNumber: "desc" } });
  if (open) return db.listingRevision.update({ where: { id: open.id }, data: { data: input as Prisma.InputJsonValue, status: "DRAFT" } });
  const pending = await db.listingRevision.findFirst({ where: { listingId, status: { in: ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"] } } });
  if (pending) throw new WorkflowError("An update is already under review. Wait for the decision before making more changes.");
  const last = await db.listingRevision.aggregate({ where: { listingId }, _max: { revisionNumber: true } });
  return db.listingRevision.create({ data: { listingId, revisionNumber: (last._max.revisionNumber ?? 0) + 1, status: "DRAFT", data: input as Prisma.InputJsonValue, submittedById: actor.userId ?? null } });
}

/** Submits a draft revision. It enters automated checks; it is never published directly. */
export async function submitRevision(revisionId: string, actor: Actor, notes?: string, changeSummary?: string) {
  const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { listing: true } });
  if (rev.status !== "DRAFT") throw new WorkflowError("Only drafts can be submitted");
  const input = listingInputSchema.parse(rev.data);
  const host = new URL(input.websiteUrl).hostname.toLowerCase();
  if (rev.listing.developerId) {
    const org = await db.developerOrg.findUniqueOrThrow({ where: { id: rev.listing.developerId } });
    if (org.status !== "ACTIVE") throw new WorkflowError("This developer account is suspended");
    if (!(await orgOwnsDomain(org.id, host))) throw new WorkflowError(`Verify ownership of ${host} (Developer portal → Domains) before submitting.`);
  }
  await db.$transaction(async (tx) => {
    await tx.listingRevision.update({ where: { id: rev.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submitterNotes: notes ?? null, changeSummary: changeSummary?.trim().slice(0, 300) || null } });
    if (!rev.listing.publishedAt && rev.listing.status !== "SUBMITTED") {
      await tx.listing.update({ where: { id: rev.listingId }, data: { status: "SUBMITTED" } });
      await statusChange(rev.listingId, rev.listing.status, "SUBMITTED", actor, undefined, tx);
    }
    await tx.job.create({ data: { type: "submission.check", payload: { revisionId }, dedupeKey: `submission.check:${revisionId}` } });
  });
  await audit({ actorType: actor.type, actorUserId: actor.userId, adminId: actor.adminId, action: "listing.revision.submit", targetType: "ListingRevision", targetId: revisionId });
}

/**
 * Automated checks + risk-based routing. Auto-approval only when every check
 * passed, an external threat-intel provider ran, the tier policy allows it, the
 * category needs no manual review/compliance and the developer is established.
 */
export async function processSubmission(revisionId: string) {
  const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { listing: true } });
  if (rev.status !== "SUBMITTED") return { skipped: true as const };
  const input = listingInputSchema.parse(rev.data);
  const firstVersion = !rev.listing.publishedAt;
  // Only one runner checks a revision (the scheduler and an administrator's "Run checks now").
  const claimed = await db.listingRevision.updateMany({ where: { id: rev.id, status: "SUBMITTED" }, data: { status: "AUTOMATED_CHECKS" } });
  if (claimed.count !== 1) return { skipped: true as const };
  try {
    if (firstVersion) await db.listing.update({ where: { id: rev.listingId }, data: { status: "AUTOMATED_CHECKS" } });

    const refs = await validateRefs(input, { orgId: rev.listing.developerId ?? undefined, adminId: rev.listing.developerId ? undefined : "editorial" });
    const { scan, outcomes } = await scanListing(rev.listingId, "SUBMISSION", { revisionId });
    const intelFail = outcomes.some((o) => o.check.startsWith("THREAT_INTEL") && o.verdict === "FAIL");
    const policy = await db.monitoringPolicy.findUnique({ where: { riskTier: refs.riskTier } });
    const org = rev.listing.developerId ? await db.developerOrg.findUnique({ where: { id: rev.listing.developerId } }) : null;
    const openReports = await db.report.count({ where: { listingId: rev.listingId, status: { in: ["OPEN", "IN_REVIEW"] } } });
    // Automatic imports follow the risk-based publishing policy (Settings → Automatic web app imports);
    // developers' submissions the established rules (organisation older than a week, every check passed).
    const candidate = org ? null : await db.importCandidate.findFirst({ where: { listingId: rev.listingId }, select: { id: true, reviewRequired: true } });
    let auto: boolean;
    if (candidate) {
      const s = await getSection("imports");
      const cats = await db.category.findMany({ where: { id: { in: refs.categoryIds } }, select: { slug: true, parent: { select: { slug: true } } } });
      const d = importDecision(
        { autoPublish: s.bool("autoPublish"), maxRiskScore: s.num("maxRiskScore"), eligibleCategories: slugList(s.str("eligibleCategories")), reviewCategories: slugList(s.str("reviewCategories")) },
        { outcomes, categorySlugs: cats.flatMap((c) => [c.slug, c.parent?.slug].filter((x): x is string => Boolean(x))), manualReview: refs.manualReview, complianceRequired: refs.complianceRequired,
          tierAllowsAuto: Boolean(policy?.allowAutoApproval), reviewRequired: candidate.reviewRequired, openReports, hasLogo: Boolean(input.logoAssetId), descriptionLength: input.description.length },
      );
      const { otherListingFor } = await import("@/server/importer/dedupe");
    const duplicate = await otherListingFor(rev.listingId, rev.listing.domain);
    if (duplicate) d.reasons.push(`duplicate of the existing listing "${duplicate.name}"`);
    auto = d.publish && !intelFail && !duplicate;
      await audit({ actorType: "SYSTEM", action: auto ? "imports.auto-publish" : "imports.review-required", targetType: "Listing", targetId: rev.listingId, metadata: { riskScore: d.score, reasons: d.reasons, scanId: scan.id } });
    } else {
      const established = org ? Date.now() - org.createdAt.getTime() > 7 * 86_400_000 : false;
      auto = !intelFail && qualifiesForAutoApproval(outcomes) && Boolean(policy?.allowAutoApproval) && !refs.manualReview && !refs.complianceRequired && established && openReports === 0;
    }
    await db.listing.update({ where: { id: rev.listingId }, data: { riskTier: refs.riskTier } });

    if (intelFail) {
      await db.securityAlert.create({ data: { listingId: rev.listingId, scanId: scan.id, severity: "CRITICAL", title: "Submission matched a threat-intelligence source", details: outcomes.filter((o) => o.verdict === "FAIL").map((o) => o.summary).join("; ") } });
      const { recordSecurityEvent } = await import("@/server/security/events");
    await recordSecurityEvent("import.suspicious", rev.listing.domain, { severity: "critical", detail: `threat intelligence match: ${input.name}` });
    await notifyAdmins("Submission flagged by threat intelligence", `${input.name} (${input.websiteUrl}) matched a threat-intelligence source. Review and confirm rejection.`, `/submissions/${revisionId}`);
    }
    if (auto) {
      await approveRevision(revisionId, { type: "SYSTEM" }, { publish: true, notes: "Automatically approved: all automated checks passed." });
      return { decision: "AUTO_APPROVED" as const, scanId: scan.id };
    }
    await db.listingRevision.update({ where: { id: rev.id }, data: { status: "UNDER_REVIEW" } });
    if (firstVersion) {
      await db.listing.update({ where: { id: rev.listingId }, data: { status: "UNDER_REVIEW" } });
      await statusChange(rev.listingId, "AUTOMATED_CHECKS", "UNDER_REVIEW", { type: "SYSTEM" }, `Automated checks: ${worst(outcomes.map((o) => o.verdict))}`);
    }
    if (rev.listing.developerId) {
      await notifyOrg(rev.listing.developerId, { type: "LISTING_STATUS", title: `${input.name} is under review`, body: "Automated checks are complete. A Webcenta moderator will review your submission.", linkPath: `/developer/listings/${rev.listingId}`, email: false });
    }
    return { decision: "MANUAL_REVIEW" as const, scanId: scan.id };
  } catch (e) {
    // Put the revision back so the job's retry (or "Run checks now") can check it again,
    // instead of leaving it stuck in "automated checks" forever.
    await db.listingRevision.updateMany({ where: { id: rev.id, status: "AUTOMATED_CHECKS" }, data: { status: "SUBMITTED" } });
    if (firstVersion) await db.listing.updateMany({ where: { id: rev.listingId, status: "AUTOMATED_CHECKS" }, data: { status: "SUBMITTED" } });
    throw e;
  }
}

async function upsertTags(names: string[], tx: Prisma.TransactionClient) {
  const ids: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    if (!slug) continue;
    const t = await tx.tag.upsert({ where: { slug }, create: { slug, name }, update: {} });
    ids.push(t.id);
  }
  return ids;
}

/** Copies an approved revision onto the live listing (one transaction). */
export async function approveRevision(revisionId: string, actor: Actor, opts: { publish: boolean; notes?: string }) {
  const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { listing: true } });
  if (!["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(rev.status)) throw new WorkflowError(`Cannot approve a revision in status ${rev.status}`);
  const input = listingInputSchema.parse(rev.data);
  const refs = await validateRefs(input, { orgId: rev.listing.developerId ?? undefined, adminId: rev.listing.developerId ? undefined : "editorial" });
  const url = normalizeWebsiteUrl(input.websiteUrl)!;
  const lastScan = await db.securityScan.findFirst({ where: { listingId: rev.listingId, status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
  const scanStatus = !lastScan ? "NOT_SCANNED" : lastScan.overallVerdict === "FAIL" || lastScan.overallVerdict === "WARN" ? "WARNING" : "PASSED";
  const now = new Date();
  const wasPublished = rev.listing.status === "PUBLISHED";
  const newStatus: ListingStatus = wasPublished || opts.publish ? "PUBLISHED" : "APPROVED";
  // Previous state → new state, recorded on the revision (and used to decide whether to notify).
  const { changedFields } = await import("./changes");
  const current = await db.listing.findUniqueOrThrow({ where: { id: rev.listingId }, select: { media: { orderBy: { sortOrder: "asc" }, select: { assetId: true, kind: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  const changed = wasPublished ? changedFields({
    name: rev.listing.name, tagline: rev.listing.tagline, description: rev.listing.description, features: Array.isArray(rev.listing.features) ? (rev.listing.features as string[]) : [],
    websiteUrl: rev.listing.websiteUrl, pricingModel: rev.listing.pricingModel, pricingDetails: rev.listing.pricingDetails, platforms: Array.isArray(rev.listing.platforms) ? (rev.listing.platforms as string[]) : [],
    ageRating: rev.listing.ageRating, logoAssetId: current.media.find((m) => m.kind === "LOGO")?.assetId ?? null, screenshotAssetIds: current.media.filter((m) => m.kind === "SCREENSHOT").map((m) => m.assetId),
    tags: current.tags.map((t) => t.tag.name), languages: Array.isArray(rev.listing.languages) ? (rev.listing.languages as string[]) : [], supportedCountries: Array.isArray(rev.listing.supportedCountries) ? (rev.listing.supportedCountries as string[]) : [],
  }, {
    name: input.name, tagline: input.tagline ?? null, description: input.description, features: input.features, websiteUrl: url.toString(), pricingModel: input.pricingModel, pricingDetails: input.pricingDetails ?? null,
    platforms: input.platforms, ageRating: input.ageRating, logoAssetId: input.logoAssetId ?? null, screenshotAssetIds: input.screenshotAssetIds, tags: input.tags, languages: input.languages, supportedCountries: input.supportedCountries,
  }) : [];

  await db.$transaction(async (tx) => {
    // Claim the decision inside the transaction: if two administrators (or a bulk action and the
    // automatic checks) approve the same revision at once, only one succeeds and the listing is
    // published exactly once.
    const claimed = await tx.listingRevision.updateMany({ where: { id: rev.id, status: { in: ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"] } }, data: { status: "APPROVED" } });
    if (claimed.count !== 1) throw new WorkflowError("This revision has already been decided");
    const tagIds = await upsertTags(input.tags, tx);
    await tx.listingCategory.deleteMany({ where: { listingId: rev.listingId } });
    await tx.listingCategory.createMany({ data: refs.categoryIds.map((categoryId) => ({ listingId: rev.listingId, categoryId, isPrimary: categoryId === input.primaryCategoryId })) });
    await tx.listingTag.deleteMany({ where: { listingId: rev.listingId } });
    if (tagIds.length) await tx.listingTag.createMany({ data: tagIds.map((tagId) => ({ listingId: rev.listingId, tagId })) });
    await tx.listingMedia.deleteMany({ where: { listingId: rev.listingId } });
    const media = [
      ...(input.logoAssetId ? [{ assetId: input.logoAssetId, kind: "LOGO" as const, sortOrder: 0 }] : []),
      ...input.screenshotAssetIds.map((assetId, i) => ({ assetId, kind: "SCREENSHOT" as const, sortOrder: i })),
    ];
    if (media.length) {
      await tx.listingMedia.createMany({ data: media.map((m) => ({ ...m, listingId: rev.listingId, altText: `${input.name} ${m.kind === "LOGO" ? "logo" : "screenshot"}` })) });
      await tx.mediaAsset.updateMany({ where: { id: { in: media.map((m) => m.assetId) } }, data: { moderationStatus: "APPROVED" } });
    }
    await tx.listing.update({
      where: { id: rev.listingId },
      data: {
        name: input.name, tagline: input.tagline ?? null, description: input.description, features: input.features,
        websiteUrl: url.toString(), domain: url.hostname, privacyPolicyUrl: input.privacyPolicyUrl ?? null, termsUrl: input.termsUrl ?? null, supportUrl: input.supportUrl ?? null,
        publisherName: input.publisherName, publisherUrl: input.publisherUrl ?? null, primaryCategoryId: input.primaryCategoryId,
        pricingModel: input.pricingModel, pricingDetails: input.pricingDetails ?? null, isOpenSource: input.isOpenSource, sourceCodeUrl: input.sourceCodeUrl ?? null,
        platforms: input.platforms, isBrowserBased: input.isBrowserBased, isMobileFriendly: input.isMobileFriendly, isPwaInstallable: input.isPwaInstallable,
        ageRating: input.ageRating, supportedCountries: input.supportedCountries, languages: input.languages, riskTier: refs.riskTier,
        status: newStatus, securityStatus: rev.listing.securityStatus === "RESTRICTED" ? "RESTRICTED" : scanStatus, lastVerifiedAt: now,
        ...(newStatus === "PUBLISHED" && !rev.listing.publishedAt ? { publishedAt: now } : {}),
        contentUpdatedAt: now, nextScanAt: await nextScanDate(refs.riskTier, now),
      },
    });
    await tx.listingRevision.update({ where: { id: rev.id }, data: { status: "APPROVED", reviewedById: actor.adminId ?? null, reviewedAt: now, decisionNotes: opts.notes ?? null, ...(wasPublished ? { changedFields: changed } : {}) } });
    await tx.listingRevision.updateMany({ where: { listingId: rev.listingId, id: { not: rev.id }, status: { in: ["DRAFT", "SUBMITTED"] } }, data: { status: "WITHDRAWN" } });
    await statusChange(rev.listingId, rev.listing.status, newStatus, actor, opts.notes, tx);
    if (actor.adminId) await tx.moderationAction.create({ data: { adminId: actor.adminId, action: newStatus === "PUBLISHED" ? "LISTING_PUBLISH" : "LISTING_APPROVE", targetType: "Listing", targetId: rev.listingId, reason: opts.notes ?? "Approved" } });
    await audit({ actorType: actor.type, adminId: actor.adminId, action: "listing.revision.approve", targetType: "ListingRevision", targetId: rev.id, metadata: { listingId: rev.listingId, publish: newStatus === "PUBLISHED" } }, tx);
  });
  invalidateCategoryCache();
  if (newStatus === "PUBLISHED") await queueIndexNow([rev.listing.slug]).catch(() => undefined);
  if (newStatus === "PUBLISHED" && !wasPublished) await queueAppNotification(rev.listingId, "notify.new-app");
  // Users who saved the app hear about meaningful updates only (not tags or other metadata).
  const { isMeaningful } = await import("./changes");
  if (wasPublished && isMeaningful(changed)) await queueAppNotification(rev.listingId, "notify.app-updated", rev.id);
  if (rev.listing.developerId) {
    await notifyOrg(rev.listing.developerId, {
      type: "LISTING_STATUS",
      title: newStatus === "PUBLISHED" ? (wasPublished ? `Your update to ${input.name} is live` : `${input.name} is now published`) : `${input.name} was approved`,
      body: opts.notes ?? (newStatus === "PUBLISHED" ? "Your listing is visible on Webcenta." : "It will be visible once published."),
      linkPath: `/developer/listings/${rev.listingId}`,
    });
  }
}

export async function publishListing(listingId: string, actor: Actor) {
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (l.status !== "APPROVED") throw new WorkflowError("Only approved listings can be published");
  await db.$transaction(async (tx) => {
    await tx.listing.update({ where: { id: listingId }, data: { status: "PUBLISHED", publishedAt: l.publishedAt ?? new Date() } });
    await statusChange(listingId, l.status, "PUBLISHED", actor, undefined, tx);
    if (actor.adminId) await tx.moderationAction.create({ data: { adminId: actor.adminId, action: "LISTING_PUBLISH", targetType: "Listing", targetId: listingId, reason: "Published" } });
    await audit({ actorType: actor.type, adminId: actor.adminId, action: "listing.publish", targetType: "Listing", targetId: listingId }, tx);
  });
  await queueIndexNow([l.slug]).catch(() => undefined);
  await queueAppNotification(listingId, "notify.new-app");
  if (l.developerId) await notifyOrg(l.developerId, { type: "LISTING_STATUS", title: `${l.name} is now published`, linkPath: `/developer/listings/${listingId}` });
}

export async function decideRevision(revisionId: string, actor: Actor, decision: "REJECT" | "INFO_REQUIRED", notes: string) {
  if (!notes.trim()) throw new WorkflowError("Please explain the decision to the developer");
  const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { listing: true } });
  if (!["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(rev.status)) throw new WorkflowError(`Revision is ${rev.status}`);
  const revStatus = decision === "REJECT" ? "REJECTED" : "INFO_REQUIRED";
  await db.$transaction(async (tx) => {
    await tx.listingRevision.update({ where: { id: rev.id }, data: { status: revStatus, reviewedById: actor.adminId ?? null, reviewedAt: new Date(), decisionNotes: notes } });
    if (!rev.listing.publishedAt) {
      await tx.listing.update({ where: { id: rev.listingId }, data: { status: revStatus } });
      await statusChange(rev.listingId, rev.listing.status, revStatus, actor, notes, tx);
    }
    if (actor.adminId) await tx.moderationAction.create({ data: { adminId: actor.adminId, action: decision === "REJECT" ? "LISTING_REJECT" : "LISTING_REQUEST_INFO", targetType: "Listing", targetId: rev.listingId, reason: notes } });
    await audit({ actorType: actor.type, adminId: actor.adminId, action: decision === "REJECT" ? "listing.revision.reject" : "listing.revision.request-info", targetType: "ListingRevision", targetId: rev.id, metadata: { notes } }, tx);
  });
  if (rev.listing.developerId) {
    const name = (rev.data as { name?: string }).name ?? rev.listing.name;
    await notifyOrg(rev.listing.developerId, {
      type: "LISTING_STATUS", title: decision === "REJECT" ? `${name} was not approved` : `More information needed for ${name}`, body: notes,
      linkPath: `/developer/listings/${rev.listingId}`,
    });
  }
}

/** Developer re-opens an INFO_REQUIRED revision for editing (it becomes a draft again). */
export async function reopenForEdit(revisionId: string) {
  const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId } });
  if (rev.status !== "INFO_REQUIRED" && rev.status !== "REJECTED") throw new WorkflowError("Not editable");
  await db.listingRevision.update({ where: { id: revisionId }, data: { status: "DRAFT" } });
}

export async function setListingStatus(listingId: string, to: "SUSPENDED" | "REMOVED" | "PUBLISHED", actor: Actor, reason: string) {
  if (!reason.trim()) throw new WorkflowError("A reason is required");
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (to === "PUBLISHED" && !["SUSPENDED", "REMOVED"].includes(l.status)) throw new WorkflowError("Only suspended or removed listings can be restored");
  if (to === "PUBLISHED" && !l.publishedAt) throw new WorkflowError("This listing was never approved");
  await db.$transaction(async (tx) => {
    await tx.listing.update({ where: { id: listingId }, data: { status: to, ...(to === "PUBLISHED" ? { securityStatus: l.securityStatus === "RESTRICTED" ? "UNDER_INVESTIGATION" : l.securityStatus } : {}) } });
    await statusChange(listingId, l.status, to, actor, reason, tx);
    await tx.moderationAction.create({ data: { adminId: actor.adminId ?? null, actorType: actor.type, action: to === "SUSPENDED" ? "LISTING_SUSPEND" : to === "REMOVED" ? "LISTING_REMOVE" : "LISTING_RESTORE", targetType: "Listing", targetId: listingId, reason } });
    await audit({ actorType: actor.type, adminId: actor.adminId, action: `listing.${to === "PUBLISHED" ? "restore" : to.toLowerCase()}`, targetType: "Listing", targetId: listingId, metadata: { reason, from: l.status } }, tx);
  });
  invalidateCategoryCache();
  // Tell IndexNow search engines the public page changed (it now returns 404, or is back).
  if (l.publishedAt) await queueIndexNow([l.slug]).catch(() => undefined);
  if (l.developerId) {
    await notifyOrg(l.developerId, { type: "MODERATION_NOTICE", title: to === "PUBLISHED" ? `${l.name} has been reinstated` : `${l.name} has been ${to === "SUSPENDED" ? "suspended" : "removed"}`, body: reason, linkPath: `/developer/listings/${listingId}` });
  }
}

/** Editorial listing created by an administrator; credited to the original publisher; goes through the same checks. */
export async function createEditorialListing(adminId: string, raw: unknown, evidence: { source: string; evidence: string }) {
  const input = listingInputSchema.parse(raw);
  await validateRefs(input, { adminId });
  if (!evidence.source.trim()) throw new WorkflowError("Record where this listing came from (source)");
  const url = normalizeWebsiteUrl(input.websiteUrl)!;
  const listing = await db.listing.create({
    data: {
      slug: await uniqueSlug(input.name), source: "EDITORIAL", status: "SUBMITTED", name: input.name, description: input.description,
      websiteUrl: url.toString(), domain: url.hostname, publisherName: input.publisherName, primaryCategoryId: input.primaryCategoryId,
      editorialSource: evidence.source, editorialEvidence: evidence.evidence || null,
      revisions: { create: { revisionNumber: 1, status: "SUBMITTED", submittedAt: new Date(), data: input as Prisma.InputJsonValue } },
    },
    include: { revisions: true },
  });
  await statusChange(listing.id, null, "SUBMITTED", { type: "ADMIN", adminId });
  await db.job.create({ data: { type: "submission.check", payload: { revisionId: listing.revisions[0]!.id }, dedupeKey: `submission.check:${listing.revisions[0]!.id}` } });
  await audit({ actorType: "ADMIN", adminId, action: "listing.editorial.create", targetType: "Listing", targetId: listing.id });
  return listing;
}

/** Admin correction of a live listing: recorded as an approved revision. */
export async function adminEditListing(listingId: string, adminId: string, raw: unknown, reason: string) {
  const rev = await saveRevision(listingId, raw, { type: "ADMIN", adminId });
  await db.listingRevision.update({ where: { id: rev.id }, data: { status: "UNDER_REVIEW", submittedAt: new Date() } });
  await approveRevision(rev.id, { type: "ADMIN", adminId }, { publish: false, notes: `Edited by Webcenta: ${reason}` });
}

export async function requestClaim(listingId: string, orgId: string, userId: string, evidence: string) {
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (l.source !== "EDITORIAL" || l.developerId) throw new WorkflowError("This listing cannot be claimed");
  if (!(await orgOwnsDomain(orgId, l.domain))) throw new WorkflowError(`Verify ownership of ${l.domain} first (Developer portal → Domains)`);
  const v = await db.domainVerification.findFirst({ where: { orgId, status: "VERIFIED" } });
  const existing = await db.listingClaim.findFirst({ where: { listingId, orgId, decision: "PENDING" } });
  if (existing) return existing;
  const claim = await db.listingClaim.create({ data: { listingId, orgId, requestedById: userId, domainVerificationId: v?.id ?? null, evidence: evidence || null } });
  await notifyAdmins(`Listing claim: ${l.name}`, `A developer organisation requested ownership of ${l.name} (${l.domain}).`, "/claims");
  return claim;
}

export async function decideClaim(claimId: string, adminId: string, accept: boolean, notes: string) {
  const c = await db.listingClaim.findUniqueOrThrow({ where: { id: claimId }, include: { listing: true } });
  if (c.decision !== "PENDING") throw new WorkflowError("Already decided");
  await db.$transaction(async (tx) => {
    await tx.listingClaim.update({ where: { id: claimId }, data: { decision: accept ? "ACCEPTED" : "REJECTED", decisionNotes: notes || null, reviewedById: adminId, reviewedAt: new Date() } });
    if (accept) await tx.listing.update({ where: { id: c.listingId }, data: { developerId: c.orgId, claimedAt: new Date() } });
    await tx.moderationAction.create({ data: { adminId, action: "CLAIM_DECIDE", targetType: "ListingClaim", targetId: claimId, reason: notes || (accept ? "Accepted" : "Rejected") } });
    await audit({ actorType: "ADMIN", adminId, action: accept ? "claim.accept" : "claim.reject", targetType: "Listing", targetId: c.listingId }, tx);
  });
  await notifyOrg(c.orgId, { type: "CLAIM_UPDATE", title: accept ? `You now manage ${c.listing.name}` : `Claim for ${c.listing.name} was not approved`, body: notes || undefined, linkPath: "/developer" });
}
