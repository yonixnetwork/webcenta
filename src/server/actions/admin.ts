"use server";

import { getSection } from "@/server/settings/store";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { adminLogout, adminPasswordLogin, adminVerifyMfa, assertAdmin, revokeAllAdminSessions } from "@/server/admin/auth";
import { acceptInvitation, createInvitation } from "@/server/admin/invitations";
import { ROLE_RANK } from "@/server/admin/permissions";
import { requireStepUp } from "@/server/admin/step-up";
import { adminEditListing, approveRevision, createEditorialListing, decideClaim, decideRevision, processSubmission, publishListing, setListingStatus, WorkflowError } from "@/server/listings/workflow";
import { formToListingInput } from "@/server/listings/input";
import { monitorListing } from "@/server/scanner/monitor";
import { storeUpload, UploadError } from "@/server/storage/uploads";
import { mediaUrl } from "@/server/storage";
import { notify, notifyOrg } from "@/server/community/notifications";
import { recomputeRating } from "@/server/community/reviews";
import { invalidateCategoryCache } from "@/server/catalog/categories";
import { slugify } from "@/lib/url";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";
import { DEFAULT_WEIGHTS } from "@/server/analytics/ranking";

export interface ActionState { ok: boolean; message: string; redirectTo?: string; stepUp?: boolean }
const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string): ActionState => ({ ok: false, message });
const refresh = () => revalidatePath("/", "layout");
function err(e: unknown): ActionState {
  if (e instanceof ZodError) return fail(e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).slice(0, 4).join(" · "));
  if (e instanceof WorkflowError || e instanceof UploadError) return fail(e.message);
  if (e instanceof Error && e.name === "StepUpError") return { ok: false, message: e.message, stepUp: true };
  if (e instanceof Error && e.message === "FORBIDDEN") return fail("You do not have permission for this action.");
  if (e instanceof Error && e.message === "UNAUTHENTICATED") return fail("Your session expired. Sign in again.");
  if (e instanceof Error && /invitation|password|authenticator|exists|name/.test(e.message)) return fail(e.message);
  console.error(e);
  return fail("The action failed. Please try again.");
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------- Authentication ----------------
export async function adminLoginAction(_s: ActionState, f: FormData): Promise<ActionState> {
  // Per address, across all accounts (password spraying); each account also locks after 5 failures.
  const { headers } = await import("next/headers");
  const { clientIp, networkSettings } = await import("@/server/viewer");
  const { rateLimit } = await import("@/server/rate-limit");
  const ip = clientIp(await headers(), (await networkSettings()).trustedProxyHops) ?? "unknown";
  if (!(await rateLimit(`admin-login:${ip}`, 20, 900))) return fail("Too many sign-in attempts from this network. Try again in 15 minutes.");
  const r = await adminPasswordLogin(str(f, "email"), String(f.get("password") ?? ""));
  if (!r.ok) return fail(r.error);
  return { ok: true, message: "", redirectTo: "/login/mfa" };
}
export async function adminMfaAction(_s: ActionState, f: FormData): Promise<ActionState> {
  const r = await adminVerifyMfa(str(f, "code"));
  if (!r.ok) return fail(r.error ?? "Invalid code");
  return { ok: true, message: "", redirectTo: "/" };
}
export async function adminLogoutAction(): Promise<void> {
  await adminLogout();
}
export async function acceptInviteAction(token: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    if (String(f.get("password")) !== String(f.get("confirm"))) return fail("The passwords do not match.");
    await acceptInvitation(token, { name: str(f, "name"), password: String(f.get("password") ?? ""), totp: str(f, "totp") });
  } catch (e) { return err(e); }
  return { ok: true, message: "", redirectTo: "/login?invited=1" };
}

// ---------------- Submissions & listings ----------------
export async function approveRevisionAction(revisionId: string, publish: boolean, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    await approveRevision(revisionId, { type: "ADMIN", adminId: a.id }, { publish, notes: str(f, "notes") || undefined });
    refresh();
    return ok(publish ? "Approved and published." : "Approved (not yet published).");
  } catch (e) { return err(e); }
}
export async function decideRevisionAction(revisionId: string, decision: "REJECT" | "INFO_REQUIRED", _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    await decideRevision(revisionId, { type: "ADMIN", adminId: a.id }, decision, str(f, "notes"));
    refresh();
    return ok(decision === "REJECT" ? "Rejected. The developer has been notified." : "Information requested from the developer.");
  } catch (e) { return err(e); }
}
export async function rerunChecksAction(revisionId: string): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: revisionId } });
    if (rev.status !== "UNDER_REVIEW") return fail("Checks can be re-run only for revisions under review.");
    await db.listingRevision.update({ where: { id: revisionId }, data: { status: "SUBMITTED" } });
    await processSubmission(revisionId);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "listing.revision.rerun-checks", targetType: "ListingRevision", targetId: revisionId });
    refresh();
    return ok("Automated checks re-run.");
  } catch (e) { return err(e); }
}
export async function setListingStatusAction(listingId: string, to: "SUSPENDED" | "REMOVED" | "PUBLISHED", _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    if (to !== "PUBLISHED") await requireStepUp(a, str(f, "stepUpCode"), `listing.${to.toLowerCase()}`);
    await setListingStatus(listingId, to, { type: "ADMIN", adminId: a.id }, str(f, "reason"));
    refresh();
    return ok(to === "PUBLISHED" ? "Listing reinstated." : `Listing ${to.toLowerCase()}.`);
  } catch (e) { return err(e); }
}
export async function publishListingAction(listingId: string): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    await publishListing(listingId, { type: "ADMIN", adminId: a.id });
    refresh();
    return ok("Published.");
  } catch (e) { return err(e); }
}
export async function adminEditListingAction(listingId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    const reason = str(f, "editReason");
    if (!reason) return fail("Explain the correction (shown in the history).");
    await adminEditListing(listingId, a.id, formToListingInput(f), reason);
    refresh();
    return ok("Listing updated.");
  } catch (e) { return err(e); }
}
export async function createEditorialAction(_s: ActionState, f: FormData): Promise<ActionState> {
  let id: string;
  try {
    const a = await assertAdmin("listings.moderate");
    const l = await createEditorialListing(a.id, formToListingInput(f), { source: str(f, "editorialSource"), evidence: str(f, "editorialEvidence") });
    id = l.id;
  } catch (e) { return err(e); }
  return { ok: true, message: "", redirectTo: `/listings/${id}?created=1` };
}
export async function adminUploadAction(form: FormData): Promise<{ ok: true; id: string; url: string } | { ok: false; message: string }> {
  try {
    const a = await assertAdmin("listings.moderate");
    const file = form.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Choose a file." };
    const kind = z.enum(["LOGO", "SCREENSHOT"]).parse(form.get("kind"));
    const asset = await storeUpload(file, kind, { adminId: a.id });
    return { ok: true, id: asset.id, url: mediaUrl(asset.storageKey) };
  } catch (e) { return { ok: false, message: err(e).message }; }
}
export async function toggleEditorsPickAction(listingId: string): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    await db.listing.update({ where: { id: listingId }, data: { isEditorsPick: !l.isEditorsPick } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "listing.editors-pick", targetType: "Listing", targetId: listingId, metadata: { value: !l.isEditorsPick } });
    refresh();
    return ok(l.isEditorsPick ? "Removed from Editor's picks." : "Added to Editor's picks.");
  } catch (e) { return err(e); }
}
export async function addGeoRestrictionAction(target: { listingId?: string; categoryId?: string }, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin(target.categoryId ? "catalog.manage" : "listings.moderate");
    const cc = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).parse(f.get("countryCode"));
    const reason = z.string().trim().min(3).max(300).parse(f.get("reason"));
    await db.geoRestriction.create({ data: { ...target, countryCode: cc, reason, createdByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "geo.restrict", targetType: target.listingId ? "Listing" : "Category", targetId: target.listingId ?? target.categoryId, metadata: { cc, reason } });
    invalidateCategoryCache();
    refresh();
    return ok(`Hidden in ${cc}.`);
  } catch (e) { return err(e); }
}
export async function removeGeoRestrictionAction(id: string) {
  const a = await assertAdmin("listings.moderate");
  const r = await db.geoRestriction.delete({ where: { id } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "geo.unrestrict", targetType: r.listingId ? "Listing" : "Category", targetId: r.listingId ?? r.categoryId ?? undefined, metadata: { cc: r.countryCode } });
  refresh();
}
export async function scanNowAction(listingId: string): Promise<ActionState> {
  try {
    const a = await assertAdmin("security.manage");
    const r = await monitorListing(listingId, "MANUAL", a.id);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "security.scan.manual", targetType: "Listing", targetId: listingId });
    refresh();
    return ok(`Scan complete: ${r.scan.overallVerdict}. ${r.alerts ? `${r.alerts} finding(s) raised.` : "No new findings."}`);
  } catch (e) { return err(e); }
}
export async function addPlacementAction(listingId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const slot = z.enum(["HOME_HERO", "HOME_FEATURED", "CATEGORY_TOP", "SEARCH_TOP"]).parse(f.get("slot"));
    const l = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    if (l.status !== "PUBLISHED") return fail("Only published listings can be featured.");
    const startsAt = f.get("startsAt") ? new Date(str(f, "startsAt")) : new Date();
    const endsAt = f.get("endsAt") ? new Date(str(f, "endsAt")) : null;
    await db.featuredPlacement.create({ data: { listingId, slot, startsAt, endsAt, isSponsored: false, createdByAdminId: a.id, categoryId: slot === "CATEGORY_TOP" ? l.primaryCategoryId : null } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "placement.create", targetType: "Listing", targetId: listingId, metadata: { slot } });
    refresh();
    return ok("Featured placement added.");
  } catch (e) { return err(e); }
}
export async function removePlacementAction(id: string) {
  const a = await assertAdmin("catalog.manage");
  await db.featuredPlacement.delete({ where: { id } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "placement.delete", targetType: "FeaturedPlacement", targetId: id });
  refresh();
}

// ---------------- Categories & homepage ----------------
const categorySchema = z.object({
  name: z.string().trim().min(2).max(80), slug: z.string().trim().max(80).optional(), description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(40).optional(), emoji: z.string().trim().max(16).optional(), parentId: z.string().optional(), sortOrder: z.coerce.number().int().min(0).max(10000),
  riskTier: z.enum(["LOW", "MEDIUM", "HIGH", "PROHIBITED"]), defaultAgeRating: z.enum(["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"]),
});
const flags = (f: FormData) => ({ isEnabled: f.get("isEnabled") === "on", isRestricted: f.get("isRestricted") === "on", requiresManualReview: f.get("requiresManualReview") === "on", requiresComplianceDocs: f.get("requiresComplianceDocs") === "on" });
export async function saveCategoryAction(id: string | null, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const d = categorySchema.parse({ name: f.get("name"), slug: str(f, "slug") || undefined, description: str(f, "description") || undefined, icon: str(f, "icon") || undefined, emoji: str(f, "emoji") || undefined, parentId: str(f, "parentId") || undefined, sortOrder: f.get("sortOrder") || 0, riskTier: f.get("riskTier"), defaultAgeRating: f.get("defaultAgeRating") });
    const slug = slugify(d.slug || d.name);
    if (d.parentId && d.parentId === id) return fail("A category cannot be its own parent.");
    if (d.parentId && (await db.category.findUnique({ where: { id: d.parentId } }))?.parentId) return fail("Only two levels are supported (choose a top-level parent).");
    const data = { ...d, slug, description: d.description ?? null, icon: d.icon ?? null, emoji: d.emoji ?? null, parentId: d.parentId ?? null, ...flags(f) };
    const c = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
    await audit({ actorType: "ADMIN", adminId: a.id, action: id ? "category.update" : "category.create", targetType: "Category", targetId: c.id, metadata: data as Prisma.InputJsonValue });
    invalidateCategoryCache();
    refresh();
    return ok("Category saved.");
  } catch (e) { return err(e); }
}
export async function mergeCategoryAction(sourceId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const targetId = str(f, "targetId");
    if (!targetId || targetId === sourceId) return fail("Choose a different target category.");
    const [src, tgt] = await Promise.all([db.category.findUniqueOrThrow({ where: { id: sourceId }, include: { children: true } }), db.category.findUniqueOrThrow({ where: { id: targetId } })]);
    if (src.children.length) return fail("Move or merge the subcategories first.");
    await db.$transaction(async (tx) => {
      const links = await tx.listingCategory.findMany({ where: { categoryId: sourceId } });
      for (const l of links) {
        await tx.listingCategory.upsert({ where: { listingId_categoryId: { listingId: l.listingId, categoryId: targetId } }, create: { listingId: l.listingId, categoryId: targetId, isPrimary: l.isPrimary }, update: { isPrimary: l.isPrimary || undefined } });
      }
      await tx.listingCategory.deleteMany({ where: { categoryId: sourceId } });
      await tx.listing.updateMany({ where: { primaryCategoryId: sourceId }, data: { primaryCategoryId: targetId } });
      await tx.category.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, isEnabled: false } });
      await audit({ actorType: "ADMIN", adminId: a.id, action: "category.merge", targetType: "Category", targetId: sourceId, metadata: { into: targetId, moved: links.length } }, tx);
    });
    invalidateCategoryCache();
    refresh();
    return ok(`Merged ${src.name} into ${tgt.name}.`);
  } catch (e) { return err(e); }
}
export async function updateSectionAction(id: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const cfgText = str(f, "config");
    let config: Prisma.InputJsonValue | undefined;
    if (cfgText) { try { config = JSON.parse(cfgText); } catch { return fail("Config must be valid JSON."); } }
    await db.homepageSection.update({ where: { id }, data: { title: z.string().trim().min(2).max(80).parse(f.get("title")), sortOrder: z.coerce.number().int().parse(f.get("sortOrder")), isEnabled: f.get("isEnabled") === "on", ...(config !== undefined ? { config } : {}) } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "homepage.section.update", targetType: "HomepageSection", targetId: id });
    refresh();
    return ok("Section saved.");
  } catch (e) { return err(e); }
}
export async function createEditorialCollectionAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const title = z.string().trim().min(2).max(80).parse(f.get("title"));
    const c = await db.collection.create({ data: { title, description: str(f, "description") || null, slug: `${slugify(title)}-${Date.now().toString(36)}`, isEditorial: true, visibility: "PUBLIC", createdByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "collection.editorial.create", targetType: "Collection", targetId: c.id });
    refresh();
    return ok("Collection created.");
  } catch (e) { return err(e); }
}
export async function collectionItemAction(collectionId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const slug = str(f, "slug").replace(/^.*\/app\//, "");
    const l = await db.listing.findUnique({ where: { slug } });
    if (!l || l.status !== "PUBLISHED") return fail("Published listing not found.");
    const max = await db.collectionItem.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
    await db.collectionItem.upsert({ where: { collectionId_listingId: { collectionId, listingId: l.id } }, create: { collectionId, listingId: l.id, sortOrder: (max._max.sortOrder ?? -1) + 1 }, update: {} });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "collection.item.add", targetType: "Collection", targetId: collectionId, metadata: { listingId: l.id } });
    refresh();
    return ok(`Added ${l.name}.`);
  } catch (e) { return err(e); }
}
export async function collectionRemoveAction(collectionId: string, listingId: string) {
  const a = await assertAdmin("catalog.manage");
  await db.collectionItem.deleteMany({ where: { collectionId, listingId } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "collection.item.remove", targetType: "Collection", targetId: collectionId, metadata: { listingId } });
  refresh();
}

// ---------------- Users & developers ----------------
export async function setUserStatusAction(userId: string, to: "SUSPENDED" | "ACTIVE", _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("users.suspend");
    const reason = str(f, "reason");
    if (to === "SUSPENDED" && reason.length < 3) return fail("A reason is required.");
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { status: to, suspendedAt: to === "SUSPENDED" ? new Date() : null, suspendReason: to === "SUSPENDED" ? reason : null } }),
      ...(to === "SUSPENDED" ? [db.session.deleteMany({ where: { userId } })] : []),
      db.authEvent.create({ data: { userId, type: to === "SUSPENDED" ? "ACCOUNT_SUSPENDED" : "ACCOUNT_REINSTATED" } }),
      db.moderationAction.create({ data: { adminId: a.id, action: to === "SUSPENDED" ? "USER_SUSPEND" : "USER_REINSTATE", targetType: "User", targetId: userId, reason: reason || "Reinstated" } }),
    ]);
    await audit({ actorType: "ADMIN", adminId: a.id, action: to === "SUSPENDED" ? "user.suspend" : "user.reinstate", targetType: "User", targetId: userId, metadata: { reason } });
    refresh();
    return ok(to === "SUSPENDED" ? "User suspended and signed out." : "User reinstated.");
  } catch (e) { return err(e); }
}
export async function setOrgStatusAction(orgId: string, to: "SUSPENDED" | "ACTIVE", _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("developers.verify");
    const reason = str(f, "reason");
    if (to === "SUSPENDED" && reason.length < 3) return fail("A reason is required.");
    await db.developerOrg.update({ where: { id: orgId }, data: { status: to, suspendedAt: to === "SUSPENDED" ? new Date() : null, suspendReason: to === "SUSPENDED" ? reason : null } });
    await db.moderationAction.create({ data: { adminId: a.id, action: to === "SUSPENDED" ? "DEVELOPER_SUSPEND" : "DEVELOPER_REINSTATE", targetType: "DeveloperOrg", targetId: orgId, reason: reason || "Reinstated" } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: to === "SUSPENDED" ? "developer.suspend" : "developer.reinstate", targetType: "DeveloperOrg", targetId: orgId, metadata: { reason } });
    await notifyOrg(orgId, { type: "MODERATION_NOTICE", title: to === "SUSPENDED" ? "Your developer account has been suspended" : "Your developer account has been reinstated", body: reason || undefined, linkPath: "/developer" });
    refresh();
    return ok(to === "SUSPENDED" ? "Developer suspended." : "Developer reinstated.");
  } catch (e) { return err(e); }
}
export async function setOrgVerificationAction(orgId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const level = z.enum(["UNVERIFIED", "DOMAIN_VERIFIED", "BUSINESS_VERIFIED"]).parse(f.get("level"));
    const a = await assertAdmin(level === "BUSINESS_VERIFIED" ? "developers.verifyBusiness" : "developers.verify");
    await db.developerOrg.update({ where: { id: orgId }, data: { verificationLevel: level, verifiedAt: level === "UNVERIFIED" ? null : new Date() } });
    await db.moderationAction.create({ data: { adminId: a.id, action: "DEVELOPER_VERIFY", targetType: "DeveloperOrg", targetId: orgId, reason: `${level}: ${str(f, "notes")}` } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "developer.verification.set", targetType: "DeveloperOrg", targetId: orgId, metadata: { level, notes: str(f, "notes") } });
    refresh();
    return ok(`Verification set to ${level.replace(/_/g, " ").toLowerCase()}.`);
  } catch (e) { return err(e); }
}
export async function decideComplianceDocAction(docId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("developers.verify");
    const decision = z.enum(["ACCEPTED", "REJECTED", "INFO_REQUIRED"]).parse(f.get("decision"));
    const d = await db.complianceDocument.update({ where: { id: docId }, data: { decision, decisionNotes: str(f, "notes") || null, reviewedById: a.id, reviewedAt: new Date() } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "compliance.decide", targetType: "ComplianceDocument", targetId: docId, metadata: { decision } });
    await notifyOrg(d.orgId, { type: "MODERATION_NOTICE", title: `Compliance document ${decision.replace(/_/g, " ").toLowerCase()}`, body: str(f, "notes") || undefined, linkPath: d.listingId ? `/developer/listings/${d.listingId}` : "/developer" });
    refresh();
    return ok("Decision saved.");
  } catch (e) { return err(e); }
}

// ---------------- Moderation ----------------
export async function resolveReportAction(reportId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("content.moderate");
    const status = z.enum(["IN_REVIEW", "RESOLVED_ACTION_TAKEN", "RESOLVED_NO_ACTION", "DISMISSED"]).parse(f.get("status"));
    const notes = str(f, "notes");
    const r = await db.report.update({ where: { id: reportId }, data: { status, resolutionNotes: notes || null, assignedAdminId: a.id, resolvedAt: status === "IN_REVIEW" ? null : new Date() } });
    await db.moderationAction.create({ data: { adminId: a.id, action: "REPORT_RESOLVE", targetType: "Report", targetId: reportId, reportId, reason: `${status}${notes ? `: ${notes}` : ""}` } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "report.update", targetType: "Report", targetId: reportId, metadata: { status } });
    if (r.reporterId && status !== "IN_REVIEW") await notify(r.reporterId, { type: "REPORT_UPDATE", title: "Your report has been reviewed", body: status === "RESOLVED_ACTION_TAKEN" ? "Thank you. We took action based on your report." : "Thank you. After review, no action was required.", linkPath: "/account/reports" });
    refresh();
    return ok("Report updated.");
  } catch (e) { return err(e); }
}
export async function moderateReviewAction(reviewId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("content.moderate");
    const status = z.enum(["PUBLISHED", "HIDDEN", "REMOVED"]).parse(f.get("status"));
    const reason = str(f, "reason") || status;
    const r = await db.$transaction(async (tx) => {
      const r = await tx.review.update({ where: { id: reviewId }, data: { status } });
      await recomputeRating(r.listingId, tx);
      await tx.moderationAction.create({ data: { adminId: a.id, action: status === "PUBLISHED" ? "REVIEW_RESTORE" : status === "HIDDEN" ? "REVIEW_HIDE" : "REVIEW_REMOVE", targetType: "Review", targetId: reviewId, reason } });
      await audit({ actorType: "ADMIN", adminId: a.id, action: `review.${status.toLowerCase()}`, targetType: "Review", targetId: reviewId, metadata: { reason } }, tx);
      return r;
    });
    if (status !== "PUBLISHED") await notify(r.userId, { type: "MODERATION_NOTICE", title: "Your review was removed by a moderator", body: `Reason: ${reason}. You can appeal from your account if you disagree.`, linkPath: "/account/reviews" });
    refresh();
    return ok(`Review ${status.toLowerCase()}.`);
  } catch (e) { return err(e); }
}
export async function decideAppealAction(appealId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("content.moderate");
    const decision = z.enum(["UPHELD", "OVERTURNED", "IN_REVIEW"]).parse(f.get("decision"));
    const notes = str(f, "notes");
    const ap = await db.appeal.update({ where: { id: appealId }, data: { status: decision, decisionNotes: notes || null, decidedById: decision === "IN_REVIEW" ? null : a.id, decidedAt: decision === "IN_REVIEW" ? null : new Date() } });
    await db.moderationAction.create({ data: { adminId: a.id, action: "APPEAL_DECIDE", targetType: "Appeal", targetId: appealId, appealId, reason: `${decision}${notes ? `: ${notes}` : ""}` } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "appeal.decide", targetType: "Appeal", targetId: appealId, metadata: { decision } });
    if (decision !== "IN_REVIEW") await notify(ap.appellantId, { type: "MODERATION_NOTICE", title: decision === "OVERTURNED" ? "Your appeal was successful" : "Your appeal was reviewed", body: notes || undefined, linkPath: ap.listingId ? `/developer/listings/${ap.listingId}` : "/account" });
    refresh();
    return ok("Appeal updated.");
  } catch (e) { return err(e); }
}
export async function decideClaimAction(claimId: string, accept: boolean, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("developers.verify");
    await decideClaim(claimId, a.id, accept, str(f, "notes"));
    refresh();
    return ok(accept ? "Claim accepted." : "Claim rejected.");
  } catch (e) { return err(e); }
}

// ---------------- Security ----------------
export async function alertAction(alertId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("security.manage");
    const op = z.enum(["INVESTIGATING", "RESOLVED_FALSE_POSITIVE", "RESOLVED_NO_ACTION", "RESOLVED_ACTION_TAKEN"]).parse(f.get("op"));
    const notes = str(f, "notes");
    if (op !== "INVESTIGATING" && notes.length < 3) return fail("Record your findings in the notes.");
    const alert = await db.securityAlert.update({ where: { id: alertId }, data: { status: op, resolutionNotes: notes || null, assignedAdminId: a.id, resolvedAt: op === "INVESTIGATING" ? null : new Date() } });
    if (op === "RESOLVED_FALSE_POSITIVE" || op === "RESOLVED_NO_ACTION") {
      const open = await db.securityAlert.count({ where: { listingId: alert.listingId, status: { in: ["OPEN", "INVESTIGATING"] } } });
      if (open === 0) {
        await db.listing.update({ where: { id: alert.listingId }, data: { securityStatus: "PASSED" } });
        await db.moderationAction.create({ data: { adminId: a.id, action: "LISTING_RESTORE", targetType: "Listing", targetId: alert.listingId, reason: `Security alert resolved: ${notes}` } });
      }
    }
    await audit({ actorType: "ADMIN", adminId: a.id, action: "security.alert.update", targetType: "SecurityAlert", targetId: alertId, metadata: { op, notes } });
    refresh();
    return ok("Alert updated.");
  } catch (e) { return err(e); }
}
export async function updatePolicyAction(tier: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED", _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    await requireStepUp(a, str(f, "stepUpCode"), "security.policy");
    const d = { scanIntervalHours: z.coerce.number().int().min(1).max(24 * 30).parse(f.get("scanIntervalHours")), autoRestrictAtSeverity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).parse(f.get("autoRestrictAtSeverity")), allowAutoApproval: f.get("allowAutoApproval") === "on" && tier === "LOW" };
    await db.monitoringPolicy.upsert({ where: { riskTier: tier }, create: { riskTier: tier, ...d }, update: d });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "security.policy.update", targetType: "MonitoringPolicy", targetId: tier, metadata: d });
    refresh();
    return ok(tier === "LOW" || !(f.get("allowAutoApproval") === "on") ? "Policy saved." : "Policy saved. Auto-approval is only allowed for the LOW tier.");
  } catch (e) { return err(e); }
}
export async function updateBlocklistAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("security.manage");
    await requireStepUp(a, str(f, "stepUpCode"), "security.blocklist");
    const list = [...new Set(str(f, "domains").split(/[\s,]+/).map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
    await db.systemSetting.upsert({ where: { key: "security.domainBlocklist" }, create: { key: "security.domainBlocklist", value: list, updatedByAdminId: a.id, description: "Known-bad domains (scanner FAIL)" }, update: { value: list, updatedByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "security.blocklist.update", metadata: { count: list.length } });
    refresh();
    return ok(`${list.length} domain(s) on the blocklist.`);
  } catch (e) { return err(e); }
}

// ---------------- Support ----------------
export async function supportReplyAction(caseId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("support.manage");
    const body = z.string().trim().min(2).max(5000).parse(f.get("body"));
    const internal = f.get("internal") === "on";
    const c = await db.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    await db.supportCaseMessage.create({ data: { caseId, fromAdminId: a.id, body, isInternal: internal } });
    await db.supportCase.update({ where: { id: caseId }, data: { status: internal ? c.status : "PENDING_USER", assignedAdminId: c.assignedAdminId ?? a.id } });
    if (!internal) {
      const m = actionEmail({ title: `Re: ${c.subject}`, intro: body, actionLabel: "Visit Webcenta", url: process.env.PUBLIC_ORIGIN || "http://localhost:3000" });
      await sendEmail({ to: c.contactEmail, subject: `Re: ${c.subject}`, template: "support-reply", ...m });
    }
    await audit({ actorType: "ADMIN", adminId: a.id, action: internal ? "support.note" : "support.reply", targetType: "SupportCase", targetId: caseId });
    refresh();
    return ok(internal ? "Internal note added." : "Reply sent by email.");
  } catch (e) { return err(e); }
}
export async function supportStatusAction(caseId: string, status: "RESOLVED" | "CLOSED" | "OPEN") {
  const a = await assertAdmin("support.manage");
  await db.supportCase.update({ where: { id: caseId }, data: { status, closedAt: status === "OPEN" ? null : new Date() } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "support.status", targetType: "SupportCase", targetId: caseId, metadata: { status } });
  refresh();
}
export async function broadcastAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const audience = z.enum(["ALL_USERS", "DEVELOPERS"]).parse(f.get("audience"));
    const title = z.string().trim().min(3).max(120).parse(f.get("title"));
    const body = z.string().trim().max(1000).parse(f.get("body"));
    await db.job.create({ data: { type: "notify.broadcast", payload: { audience, title, body } } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "notification.broadcast", metadata: { audience, title } });
    return ok("Announcement queued; it will be delivered in-app within a few minutes.");
  } catch (e) { return err(e); }
}

// ---------------- Monetisation (no billing) ----------------
export async function savePlanAction(id: string | null, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("monetization.manage");
    let entitlements: Prisma.InputJsonValue;
    try { entitlements = JSON.parse(str(f, "entitlements") || "{}"); } catch { return fail("Entitlements must be valid JSON."); }
    const d = { code: slugify(z.string().min(2).max(40).parse(str(f, "code"))), name: z.string().trim().min(2).max(60).parse(str(f, "name")), entitlements, priceCents: f.get("priceCents") ? z.coerce.number().int().min(0).parse(f.get("priceCents")) : null, currency: str(f, "currency").toUpperCase() || null, isActive: f.get("isActive") === "on" };
    const p = id ? await db.developerPlan.update({ where: { id }, data: d }) : await db.developerPlan.create({ data: d });
    await audit({ actorType: "ADMIN", adminId: a.id, action: id ? "plan.update" : "plan.create", targetType: "DeveloperPlan", targetId: p.id, metadata: d });
    refresh();
    return ok("Plan saved. Note: no payment provider is connected, so no one can be charged.");
  } catch (e) { return err(e); }
}
export async function decideSponsorshipAction(id: string, approve: boolean, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("monetization.manage");
    const s = await db.sponsorship.findUniqueOrThrow({ where: { id }, include: { listing: true } });
    if (s.status !== "PENDING_REVIEW") return fail("Already decided.");
    if (approve) {
      if (s.listing.status !== "PUBLISHED" || s.listing.securityStatus === "RESTRICTED") return fail("The listing is not published or not in good standing; payment never bypasses moderation.");
      const startsAt = f.get("startsAt") ? new Date(str(f, "startsAt")) : new Date();
      const endsAt = f.get("endsAt") ? new Date(str(f, "endsAt")) : new Date(startsAt.getTime() + 14 * 86_400_000);
      await db.$transaction([
        db.sponsorship.update({ where: { id }, data: { status: startsAt > new Date() ? "SCHEDULED" : "ACTIVE", startsAt, endsAt, decisionNotes: str(f, "notes") || null } }),
        db.featuredPlacement.create({ data: { listingId: s.listingId, slot: s.slot, isSponsored: true, sponsorshipId: id, startsAt, endsAt, createdByAdminId: a.id, categoryId: s.slot === "CATEGORY_TOP" ? s.listing.primaryCategoryId : null } }),
      ]);
    } else {
      await db.sponsorship.update({ where: { id }, data: { status: "REJECTED", decisionNotes: str(f, "notes") || null } });
    }
    await audit({ actorType: "ADMIN", adminId: a.id, action: approve ? "sponsorship.approve" : "sponsorship.reject", targetType: "Sponsorship", targetId: id });
    await notifyOrg(s.orgId, { type: "LISTING_STATUS", title: approve ? `Sponsored placement approved for ${s.listing.name}` : `Sponsored placement request for ${s.listing.name} was declined`, body: str(f, "notes") || undefined, linkPath: "/developer/promote" });
    refresh();
    return ok(approve ? "Approved; the placement is labelled “Sponsored”." : "Declined.");
  } catch (e) { return err(e); }
}

// ---------------- Settings & legal ----------------
export async function rankingWeightsAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const w = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, z.coerce.number().min(0).max(100).parse(f.get(k))]));
    const prev = await db.systemSetting.findUnique({ where: { key: "ranking.weights" } });
    await db.systemSetting.upsert({ where: { key: "ranking.weights" }, create: { key: "ranking.weights", value: w, updatedByAdminId: a.id, description: "Organic ranking weights" }, update: { value: w, updatedByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "settings.ranking.update", metadata: { before: prev?.value ?? null, after: w } as Prisma.InputJsonValue });
    await db.job.create({ data: { type: "ranking.recompute", payload: {} } });
    refresh();
    return ok("Ranking weights saved; scores will be recomputed.");
  } catch (e) { return err(e); }
}
export async function saveLegalPolicyAction(type: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const t = z.enum(["TERMS_OF_SERVICE", "PRIVACY_POLICY", "COOKIE_POLICY", "CONTENT_POLICY", "DEVELOPER_AGREEMENT", "REVIEW_GUIDELINES"]).parse(type);
    const last = await db.legalPolicy.aggregate({ where: { type: t }, _max: { version: true } });
    const publish = f.get("publish") === "on";
    const p = await db.legalPolicy.create({ data: { type: t, version: (last._max.version ?? 0) + 1, title: z.string().trim().min(3).max(120).parse(f.get("title")), body: z.string().trim().min(20).max(100_000).parse(f.get("body")), effectiveAt: new Date(), publishedAt: publish ? new Date() : null, createdByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: publish ? "legal.publish" : "legal.draft", targetType: "LegalPolicy", targetId: p.id, metadata: { type: t, version: p.version } });
    refresh();
    return ok(`Version ${p.version} ${publish ? "published" : "saved as draft"}.`);
  } catch (e) { return err(e); }
}
export async function publishLegalPolicyAction(id: string) {
  const a = await assertAdmin("settings.manage");
  await db.legalPolicy.update({ where: { id }, data: { publishedAt: new Date(), effectiveAt: new Date() } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "legal.publish", targetType: "LegalPolicy", targetId: id });
  refresh();
}

// ---------------- Administrators ----------------
export async function inviteAdminAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("admins.manage");
    await requireStepUp(a, str(f, "stepUpCode"), "admin.invite");
    const role = z.enum(["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT_AGENT", "ANALYTICS_VIEWER"]).parse(f.get("role"));
    if (ROLE_RANK[role] > ROLE_RANK[a.role]) return fail("You cannot grant a role higher than your own.");
    const email = z.string().trim().email().parse(f.get("email"));
    await createInvitation(email, role, a.id);
    refresh();
    return ok(`Invitation emailed to ${email}. It expires in 72 hours.`);
  } catch (e) { return err(e); }
}
export async function changeAdminRoleAction(adminId: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("admins.manage");
    await requireStepUp(a, str(f, "stepUpCode"), "admin.role");
    const role = z.enum(["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT_AGENT", "ANALYTICS_VIEWER"]).parse(f.get("role"));
    const target = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (ROLE_RANK[role] > ROLE_RANK[a.role]) return fail("You cannot grant a role higher than your own.");
    if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN" && (await db.adminUser.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } })) <= 1) return fail("The last active Super Administrator cannot be demoted.");
    await db.adminUser.update({ where: { id: adminId }, data: { role } });
    await revokeAllAdminSessions(adminId);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "admin.role.change", targetType: "AdminUser", targetId: adminId, metadata: { from: target.role, to: role } });
    refresh();
    return ok("Role changed; the administrator's sessions were revoked.");
  } catch (e) { return err(e); }
}
export async function setAdminStatusAction(adminId: string, to: "ACTIVE" | "SUSPENDED" | "DEACTIVATED"): Promise<ActionState> {
  try {
    const a = await assertAdmin("admins.manage");
    if (adminId === a.id) return fail("You cannot change your own status.");
    // No form here: the confirmation must be recent (Admin → Administrators → Confirm identity).
    await requireStepUp(a, null, "admin.status");
    const target = await db.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    if (target.role === "SUPER_ADMIN" && to !== "ACTIVE" && (await db.adminUser.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } })) <= 1) return fail("The last active Super Administrator cannot be suspended.");
    await db.adminUser.update({ where: { id: adminId }, data: { status: to } });
    if (to !== "ACTIVE") await revokeAllAdminSessions(adminId);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "admin.status.change", targetType: "AdminUser", targetId: adminId, metadata: { from: target.status, to } });
    refresh();
    return ok("Status updated.");
  } catch (e) { return err(e); }
}
export async function retryJobAction(jobId: string) {
  const a = await assertAdmin("jobs.view");
  await db.job.update({ where: { id: jobId }, data: { status: "PENDING", attempts: 0, runAt: new Date(), lastError: null } });
  await audit({ actorType: "ADMIN", adminId: a.id, action: "job.retry", targetType: "Job", targetId: jobId });
  refresh();
}

/** Confirms the administrator's identity for sensitive actions for the next 10 minutes. */
export async function confirmIdentityAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const { getAdmin } = await import("@/server/admin/auth");
    const a = await getAdmin();
    if (!a) throw new Error("UNAUTHENTICATED");
    const { requireStepUp: confirm, STEP_UP_MINUTES } = await import("@/server/admin/step-up");
    const code = str(f, "stepUpCode") || str(f, "code");
    if (!code) return fail("Enter the 6-digit code from your authenticator app.");
    await confirm(a, code, "confirm-identity");
    return ok(`Confirmed. Sensitive actions are allowed for ${STEP_UP_MINUTES} minutes on this device.`);
  } catch (e) { return err(e); }
}

/** Admin → Scheduler → Run now: runs the real job and reports its actual outcome. */
export async function runJobNowAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("jobs.view");
    const type = z.string().min(1).max(80).parse(f.get("type"));
    const { runJobNow } = await import("@/server/jobs/runner");
    const r = await runJobNow(type, a.id);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "job.run-now", targetType: "Job", targetId: r.jobId, metadata: { type, ok: r.ok, durationMs: r.durationMs } });
    refresh();
    const res = r.result ? ` Result: ${JSON.stringify(r.result).slice(0, 200)}.` : "";
    return r.ok ? ok(`${type} finished in ${r.durationMs} ms (job ${r.jobId.slice(-8)}).${res}`) : fail(`${type} failed: ${r.error ?? "unknown error"}`);
  } catch (e) { return err(e); }
}

/** Runs one full scheduler tick from the admin portal (same code path as the cron job). */
export async function runTickNowAction(): Promise<ActionState> {
  try {
    const a = await assertAdmin("jobs.view");
    const { runTick } = await import("@/server/jobs/runner");
    const r = await runTick(Math.min(20_000, (await getSection("jobs")).num("tickBudgetMs") || 20_000), "admin");
    await audit({ actorType: "ADMIN", adminId: a.id, action: "job.tick-now", metadata: { ...r } });
    refresh();
    return r.skipped ? fail("Another scheduler run is in progress; nothing was started.") : ok(`Scheduler run finished: ${r.processed} job(s) done, ${r.failed} failed, ${r.enqueued} scheduled, in ${r.durationMs} ms.`);
  } catch (e) { return err(e); }
}

export async function setJobEnabledAction(type: string, enabled: boolean) {
  const a = await assertAdmin("jobs.view");
  const { setJobEnabled } = await import("@/server/jobs/runner");
  await setJobEnabled(type, enabled, a.id);
  await audit({ actorType: "ADMIN", adminId: a.id, action: enabled ? "job.enable" : "job.disable", metadata: { type } });
  refresh();
}

// ---------------- Push notifications ----------------
/**
 * Admin → Push notifications → Test push: one notification to one chosen device. Never sent to
 * everyone; the result is the push service's real answer, recorded as a TEST delivery and audited
 * (subscription id only, never the endpoint or keys).
 */
export async function testPushAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("push.send");
    const { rateLimit } = await import("@/server/rate-limit");
    if (!(await rateLimit(`admin-push-test:${a.id}`, 20, 600))) return fail("Too many test pushes. Wait a few minutes.");
    const subscriptionId = z.string().min(1, "Choose a device.").max(64).parse(str(f, "subscriptionId"));
    const title = z.string().trim().min(3).max(120).parse(str(f, "title") || "Webcenta test notification");
    const body = z.string().trim().min(3).max(400).parse(str(f, "body") || "This is a test notification from the Webcenta team.");
    const url = z.string().trim().max(500).regex(/^\/(?!\/)[^\s]*$/, "Use a Webcenta path, for example /account/notifications").parse(str(f, "url") || "/account/notifications");
    const { sendTestPushTo } = await import("@/server/push/push");
    const r = await sendTestPushTo(subscriptionId, { title, body, url });
    if (!r.found) return fail("That device is no longer subscribed.");
    await audit({ actorType: "ADMIN", adminId: a.id, action: "push.test", targetType: "PushSubscription", targetId: subscriptionId, metadata: { outcome: r.outcome, statusCode: r.statusCode, category: r.category, platform: r.platform } });
    refresh();
    return r.accepted
      ? ok(`Test sent to 1 device (${r.platform ?? "unknown"}): accepted by the push service (HTTP ${r.statusCode ?? 201}). Acceptance does not prove the device displayed it.`)
      : fail(`Test not accepted (${r.outcome.toLowerCase()}${r.category ? `, ${r.category}` : ""}${r.statusCode ? `, HTTP ${r.statusCode}` : ""}).${r.outcome === "EXPIRED" ? " The subscription was removed; the user must turn notifications on again." : ""}`);
  } catch (e) { return err(e); }
}

/** Sends a push notification to every subscribed browser (signed in or not). */
export async function sendPushAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("push.send");
    if (!(await getSection("engagement")).bool("campaigns")) return fail("Announcements are turned off in Settings → Push notifications & reminders.");
    const title = z.string().trim().min(3).max(120).parse(f.get("title"));
    const body = z.string().trim().min(3).max(400).parse(f.get("body"));
    // Only pages on Webcenta: a notification can never send people to another website.
    const url = z.string().trim().max(500).regex(/^\/(?!\/)[^\s]*$/, "Use a Webcenta path, for example /c/ai or /app/notion").parse(str(f, "url") || "/");
    const subscribers = await db.pushSubscription.count({ where: { failureCount: { lt: 5 }, OR: [{ userId: null }, { user: { status: "ACTIVE", notifyAnnouncements: true, pushNotifications: true } }] } });
    if (!subscribers) return fail("No browser has turned on notifications yet.");
    const c = await db.pushCampaign.create({ data: { title, body, url, createdByAdminId: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "push.send", targetType: "PushCampaign", targetId: c.id, metadata: { title, url, subscribers } });
    // Send right away for up to ~10 seconds (small audiences finish here); the scheduler continues the rest.
    const { runCampaignBatch } = await import("@/server/push/push");
    const until = Date.now() + 10_000;
    while (Date.now() < until) if (await runCampaignBatch(c.id).catch(() => true)) break;
    const done = await db.pushCampaign.findUniqueOrThrow({ where: { id: c.id }, select: { status: true, delivered: true, failed: true } });
    refresh();
    return ok(`${done.status === "SENT" ? "Sent" : "Sending"} to ${subscribers} device${subscribers === 1 ? "" : "s"}: ${done.delivered} accepted by push services, ${done.failed} failed so far${done.status === "SENT" ? "" : "; the scheduler sends the rest"}. Accepted does not prove a device displayed it.`);
  } catch (e) { return err(e); }
}

// ---------------- Automatic web app imports ----------------
/** Queues one or more URLs (one per line) under a category; "now" imports the first immediately. */
export async function queueImportsAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("imports.manage");
    const { rateLimit } = await import("@/server/rate-limit");
    if (!(await rateLimit(`admin-import:${a.id}`, 30, 600))) return fail("Too many import requests. Wait a few minutes.");
    const urls = str(f, "urls").split(/[\s,]+/).map((u) => u.trim()).filter(Boolean).slice(0, 200);
    if (!urls.length) return fail("Enter at least one website address.");
    const categorySlug = z.string().trim().min(1).max(191).parse(str(f, "category"));
    const name = urls.length === 1 ? str(f, "name").trim().slice(0, 120) || null : null;
    const { queueImports, importCandidate, urlHash } = await import("@/server/importer/importer");
    const { findDuplicate } = await import("@/server/importer/dedupe");
    const { normalizeWebsiteUrl } = await import("@/lib/url");
    // Sort every address into: invalid, already listed, already queued, or new.
    const invalid: string[] = [], listed: string[] = [], fresh: string[] = [];
    for (const raw of urls) {
      const u = normalizeWebsiteUrl(raw);
      if (!u) { invalid.push(raw); continue; }
      const d = await findDuplicate(u.hostname);
      if (d?.kind === "listing") listed.push(`${u.hostname} (listed as "${d.name}")`);
      else fresh.push(u.toString());
    }
    const added = fresh.length ? await queueImports(db, fresh.map((url) => ({ url, categorySlug, name, source: "admin", priority: 10, adminId: a.id }))) : 0;
    const queued = fresh.length - added;
    await audit({ actorType: "ADMIN", adminId: a.id, action: "imports.queue", metadata: { count: added, categorySlug, invalid: invalid.length, listed: listed.length, queued } });
    if (f.get("now") === "1" && fresh.length === 1) {
      const c = await db.importCandidate.findUnique({ where: { urlHash: urlHash(fresh[0]!) } });
      if (c) {
        if (c.status === "IMPORTED") { refresh(); return fail("This website was already imported. See the table below."); }
        await db.importCandidate.update({ where: { id: c.id }, data: { status: "QUEUED", attempts: 0, createdByAdminId: a.id } });
        const r = await importCandidate(c.id);
        refresh();
        return r.status === "IMPORTED" ? ok(`Imported (job #${c.id.slice(-8)}). The security checks run on the next scheduler run (within 5 minutes), or use "Run security checks" below.`) : fail(`Not imported (job #${c.id.slice(-8)})${r.stage ? `, stage ${r.stage}` : ""}: ${r.reason}`);
      }
    }
    refresh();
    const parts = [added ? `${added} added to the queue` : "", queued ? `${queued} already in the queue` : "", listed.length ? `${listed.length} already listed: ${listed.slice(0, 5).join(", ")}` : "", invalid.length ? `${invalid.length} invalid: ${invalid.slice(0, 5).join(", ")}` : ""].filter(Boolean);
    return added ? ok(`${parts.join(" · ")}.`) : fail(`Nothing added. ${parts.join(" · ")}.`);
  } catch (e) { return err(e); }
}


/** Bulk moderation on Admin → Submissions (each record still gets the full individual checks). */
export async function bulkSubmissionsAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("listings.moderate");
    const { rateLimit } = await import("@/server/rate-limit");
    if (!(await rateLimit(`admin-bulk:${a.id}`, 60, 600))) return fail("Too many bulk actions. Wait a few minutes.");
    const op = z.enum(["approve", "approve-all", "reject", "info", "suspend"]).parse(f.get("op"));
    const valid = (x: string) => /^[0-9a-f-]{36}$/i.test(x);
    const mod = await import("@/server/listings/bulk-moderation");
    const ids = op === "approve-all" ? await mod.eligibleRevisionIds() : f.getAll("ids").map(String).filter(valid).slice(0, 500);
    if (!ids.length) return fail(op === "approve-all" ? "No submission is eligible for bulk approval right now." : "Select at least one submission.");
    const notes = str(f, "notes");
    if (op !== "approve" && op !== "approve-all" && notes.length < 10) return fail("Write a reason (at least 10 characters); it is sent to the developers.");
    if (op === "reject" || op === "suspend") await requireStepUp(a, str(f, "stepUpCode"), `submissions.bulk-${op}`);
    const r = await mod.bulkModerate(a.id, op === "approve-all" ? "approve" : op, ids, notes);
    refresh();
    const verb = { approve: "Approved and published", "approve-all": "Approved and published", reject: "Rejected", info: "Asked for more information", suspend: "Suspended" }[op];
    const skipped = r.skipped.length ? ` Not changed (${r.skipped.length}): ${r.skipped.slice(0, 8).map((x) => `${x.name}: ${x.reason}`).join("; ")}${r.skipped.length > 8 ? "…" : ""}` : "";
    return r.done ? ok(`${verb}: ${r.done}.${skipped}`) : fail(`Nothing changed.${skipped}`);
  } catch (e) { return err(e); }
}

/** Bulk and per-row actions on Admin → Import web apps (selected rows, or every eligible pending import). */
export async function bulkImportsAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("imports.manage");
    const { rateLimit } = await import("@/server/rate-limit");
    if (!(await rateLimit(`admin-bulk:${a.id}`, 60, 600))) return fail("Too many bulk actions. Wait a few minutes.");
    const raw = String(f.get("op") ?? "");
    // Per-row buttons submit "op:<id>" (e.g. "import-one:0190…") so they share this form's feedback.
    const [opName, rowId] = raw.includes(":") ? raw.split(":", 2) as [string, string] : [raw, ""];
    const op = z.enum(["publish", "publish-all", "reject", "archive", "category", "import", "exclude", "review", "retry", "retry-all", "checks", "import-one", "retry-one", "checks-one"]).parse(opName);
    const valid = (x: string) => /^[0-9a-f-]{36}$/i.test(x);
    const ids = rowId ? [rowId].filter(valid) : f.getAll("ids").map(String).filter(valid).slice(0, 500);
    if (!["publish-all", "retry-all"].includes(op) && !ids.length) return fail("Select at least one row.");
    if (op === "reject" || op === "archive") await requireStepUp(a, str(f, "stepUpCode"), `imports.bulk-${op}`);
    const bulk = await import("@/server/importer/bulk");
    const r = op === "publish" ? await bulk.bulkPublish(a.id, ids)
      : op === "publish-all" ? await bulk.bulkPublish(a.id, "all")
      : op === "reject" || op === "archive" ? await bulk.bulkReject(a.id, ids, op)
      : op === "category" ? await bulk.bulkCategory(a.id, ids, z.string().min(1, "Choose a category to move to.").parse(f.get("categoryId")))
      : op === "retry" || op === "retry-one" ? await bulk.bulkRetry(a.id, ids)
      : op === "retry-all" ? await bulk.bulkRetry(a.id, "all")
      : op === "checks" || op === "checks-one" ? await bulk.bulkChecks(a.id, ids)
      : op === "import-one" ? await bulk.bulkQueue(a.id, ids, "import")
      : await bulk.bulkQueue(a.id, ids, op);
    refresh();
    const verb: Record<string, string> = { publish: "Published", "publish-all": "Published", reject: "Rejected", archive: "Archived", category: "Moved", import: "Imported", "import-one": "Imported", exclude: "Excluded", review: "Marked for review", retry: "Queued again", "retry-one": "Queued again", "retry-all": "Queued again", checks: "Checked", "checks-one": "Checked" };
    const skipped = r.skipped.length ? ` Not changed (${r.skipped.length}): ${r.skipped.slice(0, 6).map((s) => `${s.name}: ${s.reason}`).join("; ")}${r.skipped.length > 6 ? "…" : ""}` : "";
    return r.done ? ok(`${verb[op]}: ${r.done}.${skipped}`) : fail(`Nothing changed.${skipped || " No selected row was in a state this action applies to."}`);
  } catch (e) { return err(e); }
}
