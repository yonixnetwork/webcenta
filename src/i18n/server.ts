import { cache } from "react";
import { headers } from "next/headers";
import { loadWithFallback, type Namespace } from "./catalogs";
import { DEFAULT_LOCALE, localeInfo, localizePath } from "./locales";
import { createT } from "./translate";

/** The header the proxy sets from the URL prefix (never from user input directly). */
export const LOCALE_HEADER = "x-wc-locale";

/** The language of this request: the URL prefix (public site) or the saved choice (developer portal). */
export const getLocale = cache(async (): Promise<string> => {
  const h = await headers();
  return localeInfo(h.get(LOCALE_HEADER) ?? DEFAULT_LOCALE).code;
});

export async function getT(ns: Namespace) {
  const locale = await getLocale();
  const { messages, fallback } = await loadWithFallback(locale, ns);
  return createT(locale, messages, fallback);
}

/** Catalogue for the browser (common namespace only) and its English fallback. */
export async function clientMessages() {
  const locale = await getLocale();
  return { locale, ...(await loadWithFallback(locale, "common")) };
}

/** Prefixes an internal path with the current language ("/app/x" → "/es/app/x"). */
export async function lp(path: string) {
  return localizePath(path, await getLocale());
}
