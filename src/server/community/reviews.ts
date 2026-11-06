import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { publicListingWhere } from "@/server/catalog/visibility";
import { rateLimit } from "@/server/rate-limit";
import { notify } from "./notifications";
import { recordInteraction } from "@/server/personalization/signals";

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(4000).optional(),
});

export class ReviewError extends Error {}

/** Recomputes a listing's rating aggregate from its PUBLISHED reviews (exact, transactional). */
export async function recomputeRating(listingId: string, tx: Prisma.TransactionClient | typeof db = db) {
  const agg = await tx.review.aggregate({ where: { listingId, status: "PUBLISHED", deletedAt: null }, _count: true, _avg: { rating: true } });
  await tx.listing.update({ where: { id: listingId }, data: { ratingCount: agg._count, ratingAverage: agg._avg.rating ?? 0 } });
}

/**
 * Anti-spam heuristics. A review that trips one is HELD for moderation (not
 * rejected), so legitimate users are not silently lost.
 */
export async function spamSignals(userId: string, body: string | undefined, now = new Date()): Promise<string[]> {
  const signals: string[] = [];
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  if (now.getTime() - user.createdAt.getTime() < 24 * 3600_000) signals.push("new-account");
  if (body && /(https?:\/\/|www\.)\S+/i.test(body)) signals.push("contains-link");
  const recent = await db.review.count({ where: { userId, createdAt: { gte: new Date(now.getTime() - 10 * 60_000) } } });
  if (recent >= 3) signals.push("burst");
  if (body && body.length >= 30) {
    const dup = await db.review.count({ where: { body, userId: { not: userId }, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } });
    if (dup > 0) signals.push("duplicate-text");
  }
  return signals;
}

export async function upsertReview(ctx: ViewerContext, userId: string, slug: string, input: z.infer<typeof reviewSchema>) {
  const data = reviewSchema.parse(input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerified: true, status: true } });
  if (!user.emailVerified || user.status !== "ACTIVE") throw new ReviewError("Please verify your email before reviewing.");
  const listing = await db.listing.findFirst({ where: { AND: [publicListingWhere(ctx), { slug }] }, select: { id: true, developerId: true } });
  if (!listing) throw new ReviewError("This listing is not available.");
  if (listing.developerId && (await db.developerMember.findUnique({ where: { orgId_userId: { orgId: listing.developerId, userId } } }))) {
    throw new ReviewError("Members of the developer organisation cannot review their own app.");
  }
  if (!(await rateLimit(`review:${userId}`, 10, 3600))) throw new ReviewError("You are posting too quickly. Please try again later.");

  const existing = await db.review.findUnique({ where: { listingId_userId: { listingId: listing.id, userId } } });
  const signals = await spamSignals(userId, data.body);
  const status = signals.length ? "HELD_FOR_MODERATION" : "PUBLISHED";
  const review = await db.$transaction(async (tx) => {
    const r = existing
      ? await tx.review.update({ where: { id: existing.id }, data: { ...data, title: data.title || null, body: data.body || null, status: existing.status === "REMOVED" ? "REMOVED" : status, editedAt: new Date(), abuseSignals: signals } })
      : await tx.review.create({ data: { listingId: listing.id, userId, rating: data.rating, title: data.title || null, body: data.body || null, status, abuseSignals: signals } });
    await recomputeRating(listing.id, tx);
    await recordInteraction(userId, { type: "REVIEW", listingId: listing.id }, tx);
    return r;
  });
  return { review, held: review.status === "HELD_FOR_MODERATION" };
}

export async function deleteOwnReview(userId: string, reviewId: string) {
  const r = await db.review.findFirst({ where: { id: reviewId, userId } });
  if (!r) throw new ReviewError("Review not found");
  await db.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: r.id } });
    await recomputeRating(r.listingId, tx);
  });
}

export async function toggleHelpful(userId: string, reviewId: string): Promise<boolean> {
  const r = await db.review.findFirst({ where: { id: reviewId, status: "PUBLISHED" } });
  if (!r) throw new ReviewError("Review not found");
  if (r.userId === userId) throw new ReviewError("You cannot vote on your own review.");
  return db.$transaction(async (tx) => {
    const key = { reviewId_userId: { reviewId, userId } };
    const existing = await tx.reviewHelpfulVote.findUnique({ where: key });
    if (existing) await tx.reviewHelpfulVote.delete({ where: key });
    else await tx.reviewHelpfulVote.create({ data: { reviewId, userId } });
    await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: await tx.reviewHelpfulVote.count({ where: { reviewId } }) } });
    return !existing;
  });
}

/** Official developer reply; only members (OWNER/ADMIN/EDITOR) of the listing's organisation. */
export async function replyToReview(userId: string, reviewId: string, body: string) {
  const text = z.string().trim().min(2).max(2000).parse(body);
  const review = await db.review.findUnique({ where: { id: reviewId }, include: { listing: { select: { developerId: true, slug: true, name: true } } } });
  if (!review || review.status !== "PUBLISHED" || !review.listing.developerId) throw new ReviewError("Review not found");
  const member = await db.developerMember.findUnique({ where: { orgId_userId: { orgId: review.listing.developerId, userId } } });
  if (!member || member.role === "ANALYST") throw new ReviewError("You are not allowed to reply for this developer.");
  const org = await db.developerOrg.findUniqueOrThrow({ where: { id: review.listing.developerId } });
  if (org.status !== "ACTIVE") throw new ReviewError("This developer account is suspended.");
  const existing = await db.reviewReply.findUnique({ where: { reviewId } });
  const reply = await db.reviewReply.upsert({
    where: { reviewId },
    create: { reviewId, orgId: org.id, authorUserId: userId, body: text },
    update: { body: text, editedAt: new Date(), authorUserId: userId },
  });
  await notify(review.userId, {
    type: "REVIEW_REPLY",
    title: existing ? `${org.displayName} updated their reply to your review` : `${org.displayName} replied to your review`,
    body: `Your review of ${review.listing.name} received a response from the developer.`,
    linkPath: `/app/${review.listing.slug}#review-${review.id}`,
  });
  return reply;
}

export async function listingReviews(listingId: string, opts: { sort?: "helpful" | "newest"; page?: number; viewerId?: string | null }) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.ReviewWhereInput = { listingId, deletedAt: null, OR: [{ status: "PUBLISHED" }, ...(opts.viewerId ? [{ userId: opts.viewerId }] : [])] };
  const [items, total, dist] = await Promise.all([
    db.review.findMany({
      where, take: 10, skip: (page - 1) * 10,
      orderBy: opts.sort === "newest" ? [{ createdAt: "desc" }] : [{ helpfulCount: "desc" }, { createdAt: "desc" }],
      include: { user: { select: { name: true } }, reply: { include: { org: { select: { displayName: true } } } },
        helpfulVotes: opts.viewerId ? { where: { userId: opts.viewerId }, select: { userId: true } } : false },
    }),
    db.review.count({ where }),
    db.review.groupBy({ by: ["rating"], where: { listingId, status: "PUBLISHED", deletedAt: null }, _count: true }),
  ]);
  const distribution = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: dist.find((d) => d.rating === r)?._count ?? 0 }));
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / 10)), distribution };
}
