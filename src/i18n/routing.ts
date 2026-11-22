import { DEFAULT_LOCALE, isLocalizablePath, localeInfo, localizePath, normalizeLocale, splitLocalePath } from "./locales";

export type LocaleDecision =
  | { kind: "serve"; locale: string; path: string }
  | { kind: "redirect"; location: string; status: 307 | 308 };

/**
 * How the public site handles languages in URLs (used by src/proxy.ts):
 * - "/es/…" is served in Spanish from the same route as "/…" (internal rewrite).
 * - "/en/…" and prefixes of languages that are switched off redirect to the unprefixed URL.
 * - An unprefixed page is English. Only a visitor who CHOSE another language (the wc-locale
 *   cookie, set by the language selector) is sent to that language's URL, with a temporary
 *   redirect. There is no redirect from Accept-Language or the country, so crawlers and new
 *   visitors always get the URL they asked for.
 */
/** A same-site path: "//host" or "/\\host" would be read as another host by URL resolution. */
const sameSite = (location: string) => location.replace(/^[/\\]+/, "/");

export function decideLocale(input: {
  pathname: string;
  search: string;
  method: string;
  cookieLocale: string | null | undefined;
  enabled: readonly string[];
  /** Router prefetches are never redirected. */
  prefetch: boolean;
}): LocaleDecision {
  const { locale, path, prefixed } = splitLocalePath(input.pathname);
  const enabled = new Set(input.enabled);
  const first = input.pathname.split("/")[1] ?? "";

  if (first === DEFAULT_LOCALE && (input.pathname === "/en" || input.pathname.startsWith("/en/"))) {
    return { kind: "redirect", location: sameSite((input.pathname.slice(3) || "/") + input.search), status: 308 };
  }
  if (prefixed) {
    if (!enabled.has(locale) || !isLocalizablePath(path)) return { kind: "redirect", location: sameSite(path + input.search), status: 307 };
    return { kind: "serve", locale, path };
  }
  const chosen = normalizeLocale(input.cookieLocale);
  if (chosen && chosen !== DEFAULT_LOCALE && enabled.has(chosen) && !input.prefetch && (input.method === "GET" || input.method === "HEAD") && isLocalizablePath(path)) {
    return { kind: "redirect", location: sameSite(localizePath(path, chosen) + input.search), status: 307 };
  }
  return { kind: "serve", locale: DEFAULT_LOCALE, path };
}

export function htmlAttrs(locale: string) {
  const info = localeInfo(locale);
  return { lang: info.code, dir: info.dir };
}
