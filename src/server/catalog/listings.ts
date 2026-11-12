import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { publicListingWhere } from "./visibility";
import { getSection } from "@/server/settings/store";

/** Fields needed to render an application card. */
export const cardSelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  pricingModel: true,
  isOpenSource: true,
  isPwaInstallable: true,
  ageRating: true,
  ratingCount: true,
  ratingAverage: true,
  publisherName: true,
  source: true,
  securityStatus: true,
  primaryCategory: { select: { slug: true, name: true } },
  developer: { select: { verificationLevel: true } },
  // The logo first (enum order), then the first screenshot for featured cards.
  media: {
    where: { kind: { in: ["LOGO", "SCREENSHOT"] }, asset: { moderationStatus: "APPROVED" } },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    take: 2,
    select: { kind: true, altText: true, asset: { select: { storageKey: true } } },
  },
} satisfies Prisma.ListingSelect;

export type ListingCard = Prisma.ListingGetPayload<{ select: typeof cardSelect }>;

/** Default minimum number of ratings before an average is used for "highly rated". */
export const MIN_RATINGS_FOR_DISPLAY = 5;

export interface MarketplaceSettings { pageSize: number; minRatings: number; minAverage: number }
/** Admin → Settings → Marketplace. */
export async function marketplaceSettings(): Promise<MarketplaceSettings> {
  const c = await getSection("marketplace");
  return {
    pageSize: Math.min(60, Math.max(12, Math.round(c.num("searchPageSize")) || 24)),
    minRatings: Math.max(1, Math.round(c.num("highlyRatedMinRatings")) || MIN_RATINGS_FOR_DISPLAY),
    minAverage: Math.min(5, Math.max(1, c.num("highlyRatedMinAverage") || 4)),
  };
}

export async function listCards(
  ctx: ViewerContext,
  opts: { where?: Prisma.ListingWhereInput; orderBy?: Prisma.ListingOrderByWithRelationInput[]; take?: number; skip?: number },
): Promise<ListingCard[]> {
  return db.listing.findMany({
    where: { AND: [publicListingWhere(ctx), opts.where ?? {}] },
    orderBy: opts.orderBy ?? [{ publishedAt: "desc" }],
    take: opts.take ?? 12,
    skip: opts.skip,
    select: cardSelect,
  });
}

export async function countListings(ctx: ViewerContext, where: Prisma.ListingWhereInput = {}) {
  return db.listing.count({ where: { AND: [publicListingWhere(ctx), where] } });
}

/** Cards for the given ids, in the given order, filtered by visibility. */
export async function cardsByIds(ctx: ViewerContext, ids: string[]): Promise<ListingCard[]> {
  if (ids.length === 0) return [];
  const rows = await db.listing.findMany({
    where: { AND: [publicListingWhere(ctx), { id: { in: ids } }] },
    select: cardSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ListingCard => Boolean(r));
}

export async function getPublicListing(ctx: ViewerContext, slug: string) {
  return db.listing.findFirst({
    where: { AND: [publicListingWhere(ctx), { slug }] },
    include: {
      primaryCategory: { include: { parent: true } },
      categories: { include: { category: { include: { parent: true } } } },
      tags: { include: { tag: true } },
      developer: { select: { slug: true, displayName: true, verificationLevel: true, websiteUrl: true } },
      media: {
        where: { asset: { moderationStatus: "APPROVED" } },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        include: { asset: { select: { storageKey: true, width: true, height: true } } },
      },
    },
  });
}

export type PublicListing = NonNullable<Awaited<ReturnType<typeof getPublicListing>>>;
