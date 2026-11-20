import type { Metadata } from "next";
import { DEFAULT_LOCALE, localizePath } from "@/i18n/locales";
import { languageAlternates } from "@/i18n/seo-rules";
import { getLocale } from "@/i18n/server";
import { i18nSettings } from "./settings";

/**
 * How a page's language versions are offered to search engines:
 * - "translated": the page's own text comes from the catalogues (home, categories, Apps).
 * - "listing": app pages — the developer's description stays in its original language; other
 *   language versions are indexed only when Admin → Languages → "Index app pages" is on.
 * - "original": the main text is not translated (policies, about, contact, collections): only the
 *   English page is indexed; other language versions exist for navigation but carry noindex.
 * hreflang lists only versions that are indexed, so every listed URL links back (reciprocal).
 */
export async function seoAlternates(path: string, kind: "translated" | "listing" | "original" = "translated"): Promise<Pick<Metadata, "alternates" | "robots">> {
  const [locale, s] = await Promise.all([getLocale(), i18nSettings()]);
  const indexed = kind === "translated" || (kind === "listing" && s.indexListings) ? s.indexed : [DEFAULT_LOCALE];
  const { languages } = languageAlternates(path, locale, indexed);
  const noindex = !indexed.includes(locale);
  return {
    alternates: { canonical: localizePath(path, locale), languages: indexed.length > 1 ? languages : undefined },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
