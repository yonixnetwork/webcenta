import { cache } from "react";
import { db } from "@/server/db";
import { getLocale } from "@/i18n/server";
import { loadCatalog } from "@/i18n/catalogs";
import { DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * Category names in the current language: an admin translation (Admin → SEO & languages →
 * Categories) first, then the bundled translation of the top-level categories, then the
 * English name from the database. Loaded once per request.
 */
export const categoryNamer = cache(async (): Promise<(c: { id?: string; slug: string; name: string }) => string> => {
  const locale = await getLocale();
  if (locale === DEFAULT_LOCALE) return (c) => c.name;
  const [rows, bundled] = await Promise.all([
    db.categoryTranslation.findMany({ where: { locale }, select: { categoryId: true, name: true } }).catch(() => []),
    loadCatalog(locale, "categories"),
  ]);
  const byId = new Map(rows.map((r) => [r.categoryId, r.name]));
  return (c) => (c.id && byId.get(c.id)) || (typeof bundled[c.slug] === "string" ? (bundled[c.slug] as string) : c.name);
});
