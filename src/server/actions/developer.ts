"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { db } from "@/server/db";
import { slugify } from "@/lib/url";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/session";
import { devListing, requireDev } from "@/server/developer/context";
import { checkVerification, normalizeDomain, startVerification } from "@/server/developer/domain-verification";
import { createDeveloperDraft, processSubmission, requestClaim, reopenForEdit, saveRevision, submitRevision, WorkflowError } from "@/server/listings/workflow";
import { formToListingInput } from "@/server/listings/input";
import { storeUpload, UploadError } from "@/server/storage/uploads";
import { mediaUrl } from "@/server/storage";
import { rateLimit } from "@/server/rate-limit";
import { notifyAdmins } from "@/server/scanner/monitor";
import { randomBytes } from "node:crypto";

export interface ActionState { ok: boolean; message: string; id?: string }
const fail = (message: string): ActionState => ({ ok: false, message });
function errMsg(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).slice(0, 4).join(" · ");
  if (e instanceof WorkflowError || e instanceof UploadError) return e.message;
  if (e instanceof Error && e.message === "FORBIDDEN") return "Your role in this organisation does not allow this action.";
  if (e instanceof Error && e.message === "NOT_FOUND") return "Not found.";
  console.error(e);
  return "Something went wrong. Please try again.";
}

export async function createOrgAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser("/developer");
  if (!user.emailVerified) return fail("Please verify your email address first.");
  const parsed = z.object({ displayName: z.string().trim().min(2).max(80), websiteUrl: z.string().trim().max(200).optional(), contactEmail: z.string().trim().email().optional().or(z.literal("")), countryCode: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/) })
    .safeParse({ displayName: form.get("displayName"), websiteUrl: form.get("websiteUrl") || undefined, contactEmail: form.get("contactEmail") ?? "", countryCode: form.get("countryCode") ?? "" });
  if (!parsed.success) return fail("Please enter an organisation name (2–80 characters) and valid details.");
  if ((await db.developerMember.count({ where: { userId: user.id, role: "OWNER" } })) >= 5) return fail("You can own at most 5 organisations.");
  const slug = `${slugify(parsed.data.displayName) || "developer"}-${randomBytes(3).toString("hex")}`;
  const org = await db.developerOrg.create({ data: { slug, displayName: parsed.data.displayName, websiteUrl: parsed.data.websiteUrl || null, contactEmail: parsed.data.contactEmail || null, countryCode: parsed.data.countryCode || null, members: { create: { userId: user.id, role: "OWNER" } } } });
  (await cookies()).set("wc-dev-org", org.id, { path: "/", httpOnly: true, sameSite: "lax", secure: (process.env.PUBLIC_ORIGIN ?? "").startsWith("https") });
  await audit({ actorType: "DEVELOPER", actorUserId: user.id, action: "developer.org.create", targetType: "DeveloperOrg", targetId: org.id });
  redirect("/developer");
}

export async function switchOrgAction(orgId: string) {
  const user = await requireUser("/developer");
  if (await db.developerMember.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } })) {
    (await cookies()).set("wc-dev-org", orgId, { path: "/", httpOnly: true, sameSite: "lax", secure: (process.env.PUBLIC_ORIGIN ?? "").startsWith("https") });
  }
  redirect("/developer");
}

export async function updateOrgAction(_s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("ADMIN");
    const d = z.object({ displayName: z.string().trim().min(2).max(80), legalName: z.string().trim().max(160), websiteUrl: z.string().trim().max(200), contactEmail: z.string().trim().email().or(z.literal("")), countryCode: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/), bio: z.string().trim().max(1000) })
      .parse(Object.fromEntries(["displayName", "legalName", "websiteUrl", "contactEmail", "countryCode", "bio"].map((k) => [k, String(form.get(k) ?? "")])));
    await db.developerOrg.update({ where: { id: ctx.org.id }, data: { displayName: d.displayName, legalName: d.legalName || null, websiteUrl: d.websiteUrl || null, contactEmail: d.contactEmail || null, countryCode: d.countryCode || null, bio: d.bio || null } });
    revalidatePath("/developer/organization");
    return { ok: true, message: "Organisation profile saved." };
  } catch (e) { return fail(errMsg(e)); }
}

export async function addMemberAction(_s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("ADMIN");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const role = z.enum(["ADMIN", "EDITOR", "ANALYST"]).parse(form.get("role"));
    const u = await db.user.findUnique({ where: { email } });
    if (!u || !u.emailVerified) return fail("No verified Webcenta account exists with that email. Ask them to sign up first.");
    await db.developerMember.upsert({ where: { orgId_userId: { orgId: ctx.org.id, userId: u.id } }, create: { orgId: ctx.org.id, userId: u.id, role }, update: { role } });
    await audit({ actorType: "DEVELOPER", actorUserId: ctx.user.id, action: "developer.member.add", targetType: "DeveloperOrg", targetId: ctx.org.id, metadata: { memberId: u.id, role } });
    revalidatePath("/developer/organization");
    return { ok: true, message: `${email} now has the ${role.toLowerCase()} role.` };
  } catch (e) { return fail(errMsg(e)); }
}

export async function removeMemberAction(userId: string) {
  const ctx = await requireDev("ADMIN");
  const target = await db.developerMember.findUnique({ where: { orgId_userId: { orgId: ctx.org.id, userId } } });
  if (!target || target.role === "OWNER") return;
  await db.developerMember.delete({ where: { orgId_userId: { orgId: ctx.org.id, userId } } });
  await audit({ actorType: "DEVELOPER", actorUserId: ctx.user.id, action: "developer.member.remove", targetType: "DeveloperOrg", targetId: ctx.org.id, metadata: { memberId: userId } });
  revalidatePath("/developer/organization");
}

export async function startDomainAction(_s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("EDITOR");
    if (!normalizeDomain(String(form.get("domain") ?? ""))) return fail("Enter a valid public domain, e.g. app.example.com");
    const method = z.enum(["DNS_TXT", "HTML_META", "WELL_KNOWN_FILE"]).parse(form.get("method"));
    await startVerification(ctx.org.id, String(form.get("domain")), method);
    revalidatePath("/developer/domains");
    return { ok: true, message: "Follow the instructions below, then click “Check now”." };
  } catch (e) { return fail(errMsg(e)); }
}

export async function checkDomainAction(id: string): Promise<ActionState> {
  try {
    const ctx = await requireDev("EDITOR");
    const v = await db.domainVerification.findFirst({ where: { id, orgId: ctx.org.id } });
    if (!v) return fail("Not found.");
    if (!(await rateLimit(`domain-check:${ctx.org.id}`, 30, 3600))) return fail("Too many checks. Try again later.");
    const r = await checkVerification(id);
    revalidatePath("/developer/domains");
    return r.ok ? { ok: true, message: `${v.domain} is verified.` } : fail(r.reason ?? "Verification failed.");
  } catch (e) { return fail(errMsg(e)); }
}

export async function uploadMediaAction(form: FormData): Promise<{ ok: true; id: string; url: string } | { ok: false; message: string }> {
  try {
    const ctx = await requireDev("EDITOR");
    const file = form.get("file");
    const kind = z.enum(["LOGO", "SCREENSHOT", "DOCUMENT"]).parse(form.get("kind"));
    if (!(file instanceof File)) return { ok: false, message: "Choose a file." };
    if (!(await rateLimit(`upload:${ctx.user.id}`, 60, 3600))) return { ok: false, message: "Upload limit reached. Try again later." };
    const asset = await storeUpload(file, kind, { userId: ctx.user.id });
    return { ok: true, id: asset.id, url: kind === "DOCUMENT" ? "" : mediaUrl(asset.storageKey) };
  } catch (e) { return { ok: false, message: errMsg(e) }; }
}

export async function saveListingAction(listingId: string | null, _s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("EDITOR");
    const raw = formToListingInput(form);
    if (!listingId) {
      const l = await createDeveloperDraft(ctx.org.id, ctx.user.id, raw);
      redirect(`/developer/listings/${l.id}?saved=1`);
    }
    await devListing(ctx, listingId);
    await saveRevision(listingId, raw, { type: "DEVELOPER", userId: ctx.user.id, orgId: ctx.org.id });
    revalidatePath(`/developer/listings/${listingId}`);
    return { ok: true, message: "Draft saved. Submit it for review when ready." };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    return fail(errMsg(e));
  }
}

export async function submitListingAction(listingId: string, _s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("EDITOR");
    await devListing(ctx, listingId);
    const rev = await db.listingRevision.findFirst({ where: { listingId, status: "DRAFT" }, orderBy: { revisionNumber: "desc" } });
    if (!rev) return fail("There is no draft to submit.");
    await submitRevision(rev.id, { type: "DEVELOPER", userId: ctx.user.id }, String(form.get("notes") ?? "").slice(0, 1000) || undefined);
    // Run automated checks right after responding; the cron job is the fallback.
    after(() => processSubmission(rev.id).then(() => db.job.updateMany({ where: { dedupeKey: `submission.check:${rev.id}`, status: "PENDING" }, data: { status: "SUCCEEDED", completedAt: new Date() } })).catch(() => undefined));
    revalidatePath(`/developer/listings/${listingId}`);
    return { ok: true, message: "Submitted. Automated checks are running; you will be notified of the decision." };
  } catch (e) { return fail(errMsg(e)); }
}

export async function reopenRevisionAction(listingId: string, revisionId: string) {
  const ctx = await requireDev("EDITOR");
  await devListing(ctx, listingId);
  await reopenForEdit(revisionId);
  redirect(`/developer/listings/${listingId}/edit`);
}

export async function complianceDocAction(listingId: string, _s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("EDITOR");
    await devListing(ctx, listingId);
    const d = z.object({ type: z.enum(["OPERATING_LICENCE", "BUSINESS_REGISTRATION", "REGULATORY_REGISTRATION", "AGE_VERIFICATION_POLICY", "RISK_DISCLOSURE", "OTHER"]), jurisdiction: z.string().trim().max(80), issuingBody: z.string().trim().max(120), referenceNo: z.string().trim().max(80) })
      .parse({ type: form.get("type"), jurisdiction: String(form.get("jurisdiction") ?? ""), issuingBody: String(form.get("issuingBody") ?? ""), referenceNo: String(form.get("referenceNo") ?? "") });
    const file = form.get("file");
    const asset = file instanceof File && file.size > 0 ? await storeUpload(file, "DOCUMENT", { userId: ctx.user.id }) : null;
    await db.complianceDocument.create({ data: { orgId: ctx.org.id, listingId, type: d.type, jurisdiction: d.jurisdiction || null, issuingBody: d.issuingBody || null, referenceNo: d.referenceNo || null, assetId: asset?.id ?? null } });
    revalidatePath(`/developer/listings/${listingId}`);
    return { ok: true, message: "Document submitted for review." };
  } catch (e) { return fail(errMsg(e)); }
}

export async function claimListingAction(_s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("ADMIN");
    const slug = String(form.get("slug") ?? "").trim().replace(/^.*\/app\//, "").replace(/[/?#].*$/, "");
    const l = await db.listing.findUnique({ where: { slug } });
    if (!l) return fail("Listing not found. Paste the listing URL or its slug.");
    await requestClaim(l.id, ctx.org.id, ctx.user.id, String(form.get("evidence") ?? "").slice(0, 2000));
    revalidatePath("/developer/claims");
    return { ok: true, message: "Claim submitted. A moderator will review it." };
  } catch (e) { return fail(errMsg(e)); }
}

export async function sponsorshipRequestAction(_s: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireDev("ADMIN");
    const listingId = String(form.get("listingId") ?? "");
    const l = await devListing(ctx, listingId);
    if (l.status !== "PUBLISHED" || l.securityStatus === "RESTRICTED") return fail("Only published listings in good standing can be promoted.");
    const slot = z.enum(["HOME_FEATURED", "CATEGORY_TOP", "SEARCH_TOP"]).parse(form.get("slot"));
    await db.sponsorship.create({ data: { orgId: ctx.org.id, listingId, slot, message: String(form.get("message") ?? "").slice(0, 1000) || null } });
    await notifyAdmins("New sponsored placement request", `${ctx.org.displayName} requested a ${slot} placement for ${l.name}.`, "/monetization");
    revalidatePath("/developer/promote");
    return { ok: true, message: "Request sent. Placements are reviewed manually and always labelled “Sponsored”." };
  } catch (e) { return fail(errMsg(e)); }
}
