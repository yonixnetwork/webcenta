"use server";

import { MIN_SIGNUP_AGE, ageOn, parseBirthDate, ratingForAge } from "@/lib/age";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getViewerContext } from "@/server/viewer";
import { toggleFavorite } from "@/server/community/favorites";
import { addToCollection, collectionSchema, createCollection, deleteCollection, removeFromCollection, updateCollection } from "@/server/community/collections";
import { deleteOwnReview, replyToReview, ReviewError, reviewSchema, toggleHelpful, upsertReview } from "@/server/community/reviews";
import { clearHistory, resetInterests, setExplicitInterests } from "@/server/personalization/signals";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";

export interface ActionState { ok: boolean; message: string }
const fail = (message: string): ActionState => ({ ok: false, message });

async function mustUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function toggleFavoriteAction(slug: string): Promise<{ saved: boolean } | { error: string }> {
  const u = await getCurrentUser();
  if (!u) return { error: "signin" };
  try {
    const saved = await toggleFavorite(await getViewerContext(), u.id, slug);
    revalidatePath("/account/favorites");
    return { saved };
  } catch (e) {
    console.error("toggleFavorite failed", e instanceof Error ? e.message : e);
    return { error: "unavailable" };
  }
}

export async function createCollectionAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  const parsed = collectionSchema.safeParse({ title: form.get("title"), description: form.get("description") || undefined, visibility: form.get("visibility") || "PRIVATE" });
  if (!parsed.success) return fail("Please give the collection a title (max 80 characters).");
  try {
    const c = await createCollection(u.id, parsed.data);
    const add = form.get("addSlug");
    if (typeof add === "string" && add) await addToCollection(await getViewerContext(), u.id, c.id, add);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not create the collection.");
  }
  revalidatePath("/account/collections");
  return { ok: true, message: "Collection created." };
}

export async function updateCollectionAction(id: string, _s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  const parsed = collectionSchema.safeParse({ title: form.get("title"), description: form.get("description") || undefined, visibility: form.get("visibility") });
  if (!parsed.success) return fail("Invalid collection details.");
  try { await updateCollection(u.id, id, parsed.data); } catch { return fail("Collection not found."); }
  revalidatePath(`/account/collections/${id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteCollectionAction(id: string) {
  const u = await mustUser();
  await deleteCollection(u.id, id).catch(() => undefined);
  revalidatePath("/account/collections");
  redirect("/account/collections");
}

export async function addToCollectionAction(collectionId: string, slug: string): Promise<ActionState> {
  const u = await getCurrentUser();
  if (!u) return fail("Please sign in.");
  try { await addToCollection(await getViewerContext(), u.id, collectionId, slug); } catch (e) { return fail(e instanceof Error ? e.message : "Could not add."); }
  revalidatePath(`/account/collections/${collectionId}`);
  return { ok: true, message: "Added to collection." };
}

export async function removeFromCollectionAction(collectionId: string, listingId: string) {
  const u = await mustUser();
  await removeFromCollection(u.id, collectionId, listingId).catch(() => undefined);
  revalidatePath(`/account/collections/${collectionId}`);
}

export async function submitReviewAction(slug: string, _s: ActionState, form: FormData): Promise<ActionState> {
  const u = await getCurrentUser();
  if (!u) return fail("Please sign in to write a review.");
  const parsed = reviewSchema.safeParse({ rating: form.get("rating"), title: form.get("title") || undefined, body: form.get("body") || undefined });
  if (!parsed.success) return fail("Please choose a rating from 1 to 5 stars.");
  try {
    const { held } = await upsertReview(await getViewerContext(), u.id, slug, parsed.data);
    revalidatePath(`/app/${slug}`);
    return { ok: true, message: held ? "Thanks! Your review will appear after a quick moderation check." : "Thanks! Your review is published." };
  } catch (e) {
    return fail(e instanceof ReviewError ? e.message : "Could not save the review.");
  }
}

export async function deleteReviewAction(reviewId: string, slug: string) {
  const u = await mustUser();
  await deleteOwnReview(u.id, reviewId).catch(() => undefined);
  revalidatePath(`/app/${slug}`);
  revalidatePath("/account/reviews");
}

export async function helpfulAction(reviewId: string, slug: string): Promise<ActionState> {
  const u = await getCurrentUser();
  if (!u) return fail("Please sign in to vote.");
  try { await toggleHelpful(u.id, reviewId); } catch (e) { return fail(e instanceof ReviewError ? e.message : "Could not vote."); }
  revalidatePath(`/app/${slug}`);
  return { ok: true, message: "" };
}

export async function reportReviewAction(reviewId: string, _s: ActionState, form: FormData): Promise<ActionState> {
  const u = await getCurrentUser();
  if (!u) return fail("Please sign in to report a review.");
  const reason = z.enum(["SPAM", "FAKE_REVIEW", "HARASSMENT", "INAPPROPRIATE", "OTHER"]).safeParse(form.get("reason"));
  if (!reason.success) return fail("Please choose a reason.");
  if (!(await rateLimit(`report-review:${u.id}`, 20, 3600))) return fail("Too many reports. Try again later.");
  const review = await db.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) return fail("Review not found.");
  const dup = await db.report.findFirst({ where: { reviewId, reporterId: u.id, status: { in: ["OPEN", "IN_REVIEW"] } } });
  if (!dup) await db.report.create({ data: { targetType: "REVIEW", reviewId, reporterId: u.id, reason: reason.data, details: String(form.get("details") ?? "").slice(0, 1000) || null } });
  return { ok: true, message: "Thanks, the review has been reported for moderation." };
}

export async function replyToReviewAction(reviewId: string, slug: string, _s: ActionState, form: FormData): Promise<ActionState> {
  const u = await getCurrentUser();
  if (!u) return fail("Please sign in.");
  try { await replyToReview(u.id, reviewId, String(form.get("body") ?? "")); } catch (e) { return fail(e instanceof ReviewError ? e.message : "Reply must be 2–2000 characters."); }
  revalidatePath(`/app/${slug}`);
  return { ok: true, message: "Reply published. The reviewer has been notified." };
}

export async function updateProfileAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  const parsed = z.object({
    name: z.string().trim().min(1).max(80),
    preferredCountry: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/),
  }).safeParse({ name: form.get("name"), preferredCountry: form.get("preferredCountry") ?? "" });
  if (!parsed.success) return fail("Please enter a name and a valid 2-letter country code (or leave it empty).");
  await db.user.update({ where: { id: u.id }, data: { name: parsed.data.name, preferredCountry: parsed.data.preferredCountry || null } });
  revalidatePath("/account");
  return { ok: true, message: "Profile saved." };
}

export async function updatePrivacyAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  const on = (k: string) => form.get(k) === "on";
  await db.user.update({ where: { id: u.id }, data: {
    personalizationEnabled: on("personalizationEnabled"), historyEnabled: on("historyEnabled"), emailNotifications: on("emailNotifications"),
  } });
  if (!on("historyEnabled")) await clearHistory(u.id);
  revalidatePath("/account/privacy");
  return { ok: true, message: "Privacy settings saved." };
}

export async function clearHistoryAction() {
  const u = await mustUser();
  await clearHistory(u.id);
  revalidatePath("/account/history");
  revalidatePath("/account/privacy");
}

export async function resetInterestsAction() {
  const u = await mustUser();
  await resetInterests(u.id);
  revalidatePath("/account/privacy");
}

export async function setInterestsAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  await setExplicitInterests(u.id, form.getAll("interest").map(String));
  revalidatePath("/account/privacy");
  revalidatePath("/");
  return { ok: true, message: "Interests saved." };
}

/** Sets the date of birth once (accounts created with Google or GitHub, or before it was asked). */
export async function birthDateAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  if (u.birthDate) return fail("Your date of birth is already set. Contact support to correct it.");
  const birthDate = parseBirthDate(form.get("birthDate"));
  if (!birthDate) return fail("Enter your date of birth.");
  const age = ageOn(birthDate);
  if (age < MIN_SIGNUP_AGE) return fail(`You must be at least ${MIN_SIGNUP_AGE} to use a Webcenta account.`);
  const rating = ratingForAge(age, u.preferredCountry);
  await db.user.update({ where: { id: u.id }, data: { birthDate, maxAgeRating: rating, adultConfirmedAt: rating === "AGE_18_PLUS" ? new Date() : null } });
  await audit({ actorType: "USER", actorUserId: u.id, action: "user.birth-date.set" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Thanks, your account is set up for your age." };
}

export async function adultContentAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  if (form.get("enable") === "1") {
    if (u.birthDate && ratingForAge(ageOn(u.birthDate), u.preferredCountry) !== "AGE_18_PLUS") return fail("Adult content is only available to adults.");
    if (!u.birthDate && form.get("confirm") !== "on") return fail("Please confirm that you are at least 18 years old.");
    await db.user.update({ where: { id: u.id }, data: { maxAgeRating: "AGE_18_PLUS", adultConfirmedAt: new Date() } });
    await audit({ actorType: "USER", actorUserId: u.id, action: "user.adult-content.enable" });
  } else {
    await db.user.update({ where: { id: u.id }, data: { maxAgeRating: "AGE_16_PLUS", adultConfirmedAt: null } });
  }
  revalidatePath("/account/privacy");
  return { ok: true, message: "Content preference saved." };
}

export async function markNotificationsReadAction() {
  const u = await mustUser();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
}

export async function deleteAccountAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  if (String(form.get("confirmEmail") ?? "").trim().toLowerCase() !== u.email.toLowerCase()) return fail("Type your account email to confirm.");
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { status: "PENDING_DELETION", deletedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: u.id } }),
  ]);
  await audit({ actorType: "USER", actorUserId: u.id, action: "user.delete.request" });
  redirect("/?account-deleted=1");
}

const PREF_KEYS = ["notifyNewApps", "notifySavedUpdates", "notifyAnnouncements", "notifyReminders", "pushNotifications", "emailNotifications"] as const;

/** Notification preferences (Account → Notifications). Security notices are always delivered. */
export async function notificationPrefsAction(_s: ActionState, form: FormData): Promise<ActionState> {
  const u = await mustUser();
  const data = Object.fromEntries(PREF_KEYS.map((k) => [k, form.get(k) === "on"])) as Record<(typeof PREF_KEYS)[number], boolean>;
  await db.user.update({ where: { id: u.id }, data });
  revalidatePath("/account/notifications");
  return { ok: true, message: "Notification preferences saved." };
}

export async function markNotificationReadAction(id: string) {
  const u = await mustUser();
  await db.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
}

export async function deleteNotificationAction(id: string) {
  const u = await mustUser();
  await db.notification.deleteMany({ where: { id, userId: u.id } });
  revalidatePath("/account/notifications");
}
