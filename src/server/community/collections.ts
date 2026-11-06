import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { slugify } from "@/lib/url";
import type { ViewerContext } from "@/server/viewer";
import { publicListingWhere } from "@/server/catalog/visibility";

export const collectionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PRIVATE"),
});

const MAX_COLLECTIONS = 50;
const MAX_ITEMS = 200;

export async function createCollection(userId: string, input: z.infer<typeof collectionSchema>) {
  const data = collectionSchema.parse(input);
  if ((await db.collection.count({ where: { ownerId: userId } })) >= MAX_COLLECTIONS) throw new Error("Collection limit reached");
  const slug = `${slugify(data.title) || "collection"}-${randomBytes(4).toString("hex")}`;
  return db.collection.create({ data: { ...data, description: data.description || null, slug, ownerId: userId } });
}

async function owned(userId: string, collectionId: string) {
  const c = await db.collection.findFirst({ where: { id: collectionId, ownerId: userId } });
  if (!c) throw new Error("Collection not found");
  return c;
}

export async function updateCollection(userId: string, collectionId: string, input: z.infer<typeof collectionSchema>) {
  await owned(userId, collectionId);
  const data = collectionSchema.parse(input);
  return db.collection.update({ where: { id: collectionId }, data: { ...data, description: data.description || null } });
}

export async function deleteCollection(userId: string, collectionId: string) {
  await owned(userId, collectionId);
  await db.collection.delete({ where: { id: collectionId } });
}

export async function addToCollection(ctx: ViewerContext, userId: string, collectionId: string, listingSlug: string) {
  await owned(userId, collectionId);
  const listing = await db.listing.findFirst({ where: { AND: [publicListingWhere(ctx), { slug: listingSlug }] }, select: { id: true } });
  if (!listing) throw new Error("Listing not available");
  if ((await db.collectionItem.count({ where: { collectionId } })) >= MAX_ITEMS) throw new Error("Collection is full");
  const max = await db.collectionItem.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
  await db.collectionItem.upsert({
    where: { collectionId_listingId: { collectionId, listingId: listing.id } },
    create: { collectionId, listingId: listing.id, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    update: {},
  });
  await db.collection.update({ where: { id: collectionId }, data: { updatedAt: new Date() } });
}

export async function removeFromCollection(userId: string, collectionId: string, listingId: string) {
  await owned(userId, collectionId);
  await db.collectionItem.deleteMany({ where: { collectionId, listingId } });
}
