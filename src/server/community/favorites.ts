import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { publicListingWhere } from "@/server/catalog/visibility";
import { recordInteraction } from "@/server/personalization/signals";

export async function toggleFavorite(ctx: ViewerContext, userId: string, slug: string): Promise<boolean> {
  const listing = await db.listing.findFirst({ where: { AND: [publicListingWhere(ctx), { slug }] }, select: { id: true } });
  if (!listing) throw new Error("Listing not available");
  const key = { userId_listingId: { userId, listingId: listing.id } };
  return db.$transaction(async (tx) => {
    const existing = await tx.favorite.findUnique({ where: key });
    if (existing) await tx.favorite.delete({ where: key });
    else await tx.favorite.create({ data: { userId, listingId: listing.id } });
    const count = await tx.favorite.count({ where: { listingId: listing.id } });
    await tx.listing.update({ where: { id: listing.id }, data: { favoriteCount: count } });
    if (!existing) await recordInteraction(userId, { type: "FAVORITE", listingId: listing.id }, tx);
    return !existing;
  });
}

export async function isFavorite(userId: string, listingId: string) {
  return Boolean(await db.favorite.findUnique({ where: { userId_listingId: { userId, listingId } } }));
}
