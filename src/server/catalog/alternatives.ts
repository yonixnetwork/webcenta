import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { cardsByIds, marketplaceSettings, type ListingCard } from "./listings";

/**
 * Content-based related listings (Phase 1). Scores candidates by:
 *   editorial relation ×10, shared primary category ×3, shared category ×1
 *   (shared parent category ×0.5), shared tag ×1.
 * Phase 5 blends in co-favourite / co-view signals.
 */
export interface RelatedGroups {
  similar: ListingCard[];
  competitors: ListingCard[];
  freeAlternatives: ListingCard[];
  openSourceAlternatives: ListingCard[];
  betterRated: ListingCard[];
}

export async function relatedCandidateIds(listingId: string, limit = 60): Promise<Array<{ id: string; score: number }>> {
  return db.$queryRaw<Array<{ id: string; score: number }>>`
    WITH me AS (SELECT id, primaryCategoryId FROM Listing WHERE id = ${listingId}),
    my_cats AS (SELECT lc.categoryId, c.parentId FROM ListingCategory lc JOIN Category c ON c.id = lc.categoryId
                WHERE lc.listingId = ${listingId}),
    my_tags AS (SELECT tagId FROM ListingTag WHERE listingId = ${listingId}),
    scored AS (
      SELECT r.toListingId AS id, 10.0 AS s FROM ListingRelation r WHERE r.fromListingId = ${listingId}
      UNION ALL
      SELECT r.fromListingId, 10.0 FROM ListingRelation r WHERE r.toListingId = ${listingId}
      UNION ALL
      SELECT l.id, 3.0 FROM Listing l, me WHERE l.primaryCategoryId = me.primaryCategoryId AND l.id <> me.id
      UNION ALL
      SELECT lc.listingId, 1.0 FROM ListingCategory lc WHERE lc.categoryId IN (SELECT categoryId FROM my_cats)
      UNION ALL
      SELECT lc.listingId, 0.5 FROM ListingCategory lc JOIN Category c ON c.id = lc.categoryId
        WHERE c.parentId IS NOT NULL AND c.parentId IN (SELECT parentId FROM my_cats WHERE parentId IS NOT NULL)
      UNION ALL
      SELECT lt.listingId, 1.0 FROM ListingTag lt WHERE lt.tagId IN (SELECT tagId FROM my_tags)
    )
    SELECT s.id, CAST(SUM(s.s) AS DOUBLE) AS score
    FROM scored s JOIN Listing l ON l.id = s.id
    WHERE s.id <> ${listingId} AND l.status = 'PUBLISHED' AND l.deletedAt IS NULL
    GROUP BY s.id
    ORDER BY score DESC, s.id
    LIMIT ${limit}`;
}

export async function getRelated(
  ctx: ViewerContext,
  listing: { id: string; pricingModel: string; isOpenSource: boolean; ratingAverage: number; ratingCount: number },
): Promise<RelatedGroups> {
  const [candidates, competitorRows] = await Promise.all([
    relatedCandidateIds(listing.id),
    db.listingRelation.findMany({ where: { fromListingId: listing.id, type: "COMPETITOR" }, select: { toListingId: true } }),
  ]);
  const cards = await cardsByIds(ctx, candidates.map((c) => c.id));
  const competitorIds = new Set(competitorRows.map((r) => r.toListingId));
  const isPaid = listing.pricingModel === "PAID" || listing.pricingModel === "SUBSCRIPTION";
  const { minRatings } = await marketplaceSettings();
  const hasRating = listing.ratingCount >= minRatings;

  return {
    similar: cards.slice(0, 8),
    competitors: cards.filter((c) => competitorIds.has(c.id)).slice(0, 8),
    freeAlternatives: isPaid ? cards.filter((c) => c.pricingModel === "FREE" || c.pricingModel === "FREEMIUM").slice(0, 8) : [],
    openSourceAlternatives: listing.isOpenSource ? [] : cards.filter((c) => c.isOpenSource).slice(0, 8),
    betterRated: hasRating
      ? cards.filter((c) => c.ratingCount >= minRatings && c.ratingAverage > listing.ratingAverage).slice(0, 8)
      : [],
  };
}
