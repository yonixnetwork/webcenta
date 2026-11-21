import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { sitemapEntries } from "@/server/seo/sitemap-entries";

/**
 * Sitemap of indexable public pages in every indexed language, with hreflang alternates
 * (see src/server/seo/sitemap-entries.ts). Split into multiple sitemaps (generateSitemaps)
 * before the catalogue exceeds the 50,000-URL limit.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return sitemapEntries((process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, ""));
}
