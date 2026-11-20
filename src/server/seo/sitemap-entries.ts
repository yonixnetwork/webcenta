import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { publicCategoryWhere, publicListingWhere } from "@/server/catalog/visibility";
import { PUBLIC_POLICIES } from "@/server/setup/legal-texts";
import { i18nSettings } from "@/server/i18n/settings";
import { DEFAULT_LOCALE, localeInfo, localizePath } from "@/i18n/locales";

type Entry = MetadataRoute.Sitemap[number];
type Freq = Entry["changeFrequency"];

/** Search engines accept at most 50,000 URLs per sitemap file. */
export const SITEMAP_LIMIT = 50_000;

/**
 * Every indexable public URL, in each language it is indexed in, with the same hreflang set the
 * page itself declares (src/server/i18n/seo.ts), so the sitemap and the pages always agree.
 * Uses a country-agnostic viewer that denies geo-restricted listings; samples are excluded.
 */
export async function sitemapEntries(origin: string): Promise<Entry[]> {
  const ctx = { country: null, maxAgeRating: "AGE_16_PLUS" as const, unknownCountryPolicy: "deny" as const };
  const [s, listings, categories, collections] = await Promise.all([
    i18nSettings(),
    db.listing.findMany({ where: { AND: [publicListingWhere(ctx), { NOT: { slug: { startsWith: "sample-" } } }] }, select: { slug: true, updatedAt: true, contentUpdatedAt: true }, take: 40_000 }),
    // 18+ categories only show an age gate to crawlers: not useful search results.
    db.category.findMany({ where: { AND: [publicCategoryWhere(), { defaultAgeRating: { not: "AGE_18_PLUS" } }] }, select: { slug: true, updatedAt: true } }),
    db.collection.findMany({ where: { isEditorial: true, visibility: "PUBLIC", NOT: { slug: { startsWith: "sample-" } } }, select: { slug: true, updatedAt: true } }),
  ]);
  const all = [...new Set([DEFAULT_LOCALE, ...s.indexed])];
  const out: Entry[] = [];
  const add = (path: string, langs: string[], changeFrequency: Freq, priority: number, lastModified?: Date) => {
    const languages = langs.length > 1
      ? { ...Object.fromEntries(langs.map((c) => [localeInfo(c).code, origin + localizePath(path, c)])), "x-default": origin + path }
      : undefined;
    for (const code of langs) {
      out.push({ url: origin + localizePath(path, code), changeFrequency, priority, ...(lastModified ? { lastModified } : {}), ...(languages ? { alternates: { languages } } : {}) });
    }
  };
  add("/", all, "daily", 1);
  add("/categories", all, "weekly", 0.8);
  add("/apps", all, "daily", 0.8);
  add("/about", [DEFAULT_LOCALE], "monthly", 0.3);
  add("/legal", [DEFAULT_LOCALE], "monthly", 0.2);
  for (const t of ["terms", "privacy", "cookies", "content", "reviews", "developers", ...Object.keys(PUBLIC_POLICIES)]) add(`/legal/${t}`, [DEFAULT_LOCALE], "monthly", 0.2);
  for (const c of categories) add(`/c/${c.slug}`, all, "daily", 0.7, c.updatedAt);
  for (const l of listings) add(`/app/${l.slug}`, s.indexListings ? all : [DEFAULT_LOCALE], "weekly", 0.6, l.contentUpdatedAt ?? l.updatedAt);
  for (const c of collections) add(`/collections/${c.slug}`, [DEFAULT_LOCALE], "weekly", 0.5, c.updatedAt);
  return out.slice(0, SITEMAP_LIMIT);
}
