import type { Prisma } from "@/generated/prisma/client";
import type { InteractionType } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/**
 * Personalisation signals for signed-in users who allow history. Never shown
 * to developers or other users; user-clearable; retained ≤ 180 days.
 */
const WEIGHTS: Partial<Record<InteractionType, number>> = {
  LISTING_VIEW: 1, LISTING_DWELL: 1.5, CATEGORY_VIEW: 0.5, SEARCH: 0.3, FAVORITE: 4, OUTBOUND_CLICK: 2, REVIEW: 3,
};

export async function recordInteraction(
  userId: string,
  e: { type: InteractionType; listingId?: string; categoryId?: string; query?: string; dwellMs?: number },
  tx: Prisma.TransactionClient | typeof db = db,
) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { historyEnabled: true, personalizationEnabled: true } });
  if (!user?.historyEnabled) return;
  await tx.interactionEvent.create({ data: { userId, type: e.type, listingId: e.listingId ?? null, categoryId: e.categoryId ?? null, query: e.query?.slice(0, 100) ?? null, dwellMs: e.dwellMs ?? null } });
  if (!user.personalizationEnabled) return;
  // Update inferred interest in the listing's primary category (or the category itself).
  let categoryId = e.categoryId;
  if (!categoryId && e.listingId) categoryId = (await tx.listing.findUnique({ where: { id: e.listingId }, select: { primaryCategoryId: true } }))?.primaryCategoryId ?? undefined;
  if (!categoryId) return;
  const w = WEIGHTS[e.type] ?? 1;
  // One atomic statement. Prisma's upsert reads then inserts, and inside a transaction
  // (saving a favourite) that read uses the transaction's snapshot, so it misses a row
  // another request (the page-view beacon) has just created and the insert fails.
  await tx.$executeRaw`
    INSERT INTO UserInterest (userId, categoryId, source, weight, updatedAt)
    VALUES (${userId}, ${categoryId}, 'INFERRED', ${w}, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE weight = weight + ${w}, updatedAt = UTC_TIMESTAMP(3)`;
}

export async function clearHistory(userId: string) {
  await db.$transaction([
    db.interactionEvent.deleteMany({ where: { userId } }),
    db.userInterest.deleteMany({ where: { userId, source: "INFERRED" } }),
  ]);
}

export async function resetInterests(userId: string) {
  await db.userInterest.deleteMany({ where: { userId } });
}

export async function setExplicitInterests(userId: string, categoryIds: string[]) {
  const valid = await db.category.findMany({ where: { id: { in: categoryIds.slice(0, 30) }, parentId: null, isEnabled: true, isRestricted: false }, select: { id: true } });
  await db.$transaction([
    db.userInterest.deleteMany({ where: { userId, source: "EXPLICIT" } }),
    db.userInterest.createMany({ data: valid.map((c) => ({ userId, categoryId: c.id, source: "EXPLICIT" as const, weight: 5 })) }),
  ]);
}
