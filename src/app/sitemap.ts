import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/server/db";
import { publicCategoryWhere, publicListingWhere } from "@/server/catalog/visibility";

/**
 * Sitemap of indexable public pages. Uses a country-agnostic viewer that denies
 * geo-restricted listings, so restricted content is never advertised.
 * Sample (fixture) listings are excluded. Split into multiple sitemaps (generateSitemaps)
 * before the catalogue exceeds ~40k URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const ctx = { country: null, maxAgeRating: "AGE_16_PLUS" as const, unknownCountryPolicy: "deny" as const };
  const [listings, categories, collections] = await Promise.all([
    db.listing.findMany({
      where: { AND: [publicListingWhere(ctx), { NOT: { slug: { startsWith: "sample-" } } }] },
      select: { slug: true, updatedAt: true }, take: 40_000,
    }),
    db.category.findMany({ where: publicCategoryWhere(), select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { isEditorial: true, visibility: "PUBLIC", NOT: { slug: { startsWith: "sample-" } } }, select: { slug: true, updatedAt: true } }),
  ]);
  return [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${origin}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...categories.map((c) => ({ url: `${origin}/c/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
    ...listings.map((l) => ({ url: `${origin}/app/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...collections.map((c) => ({ url: `${origin}/collections/${c.slug}`, lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
