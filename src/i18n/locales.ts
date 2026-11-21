/**
 * The languages Webcenta is prepared for. One registry for routing, the language selector,
 * hreflang, the sitemap and the admin translation dashboard. Edge-safe (no Node APIs).
 *
 * `code` is the BCP 47 tag used in <html lang>, hreflang and Intl formatting; `prefix` is the
 * lower-case URL segment (/es/, /pt-br/, /zh-hans/). English is the default and has no prefix.
 * A language being listed here does NOT mean it is translated: coverage comes from the
 * message catalogues (see src/i18n/coverage.ts), and only languages switched on in
 * Admin → SEO & languages are offered to visitors.
 */
export interface LocaleInfo {
  code: string;
  prefix: string;
  /** Name in the language itself (shown in the selector). */
  native: string;
  /** English name (admin screens). */
  english: string;
  dir: "ltr" | "rtl";
  tier: 1 | 2 | 3;
}

const L = (code: string, native: string, english: string, tier: 1 | 2 | 3, dir: "ltr" | "rtl" = "ltr"): LocaleInfo =>
  ({ code, prefix: code.toLowerCase(), native, english, dir, tier });

export const LOCALES: readonly LocaleInfo[] = [
  // Priority 1 (15)
  L("en", "English", "English", 1),
  L("es", "Español", "Spanish", 1),
  L("fr", "Français", "French", 1),
  L("de", "Deutsch", "German", 1),
  L("pt-BR", "Português (Brasil)", "Portuguese (Brazil)", 1),
  L("it", "Italiano", "Italian", 1),
  L("nl", "Nederlands", "Dutch", 1),
  L("ru", "Русский", "Russian", 1),
  L("ja", "日本語", "Japanese", 1),
  L("zh-Hans", "简体中文", "Chinese (Simplified)", 1),
  L("ko", "한국어", "Korean", 1),
  L("ar", "العربية", "Arabic", 1, "rtl"),
  L("hi", "हिन्दी", "Hindi", 1),
  L("tr", "Türkçe", "Turkish", 1),
  L("pl", "Polski", "Polish", 1),
  // Priority 2 (25)
  L("id", "Bahasa Indonesia", "Indonesian", 2),
  L("vi", "Tiếng Việt", "Vietnamese", 2),
  L("th", "ไทย", "Thai", 2),
  L("uk", "Українська", "Ukrainian", 2),
  L("sv", "Svenska", "Swedish", 2),
  L("da", "Dansk", "Danish", 2),
  L("nb", "Norsk bokmål", "Norwegian Bokmål", 2),
  L("fi", "Suomi", "Finnish", 2),
  L("cs", "Čeština", "Czech", 2),
  L("el", "Ελληνικά", "Greek", 2),
  L("he", "עברית", "Hebrew", 2, "rtl"),
  L("ro", "Română", "Romanian", 2),
  L("hu", "Magyar", "Hungarian", 2),
  L("ms", "Bahasa Melayu", "Malay", 2),
  L("fa", "فارسی", "Persian", 2, "rtl"),
  L("bn", "বাংলা", "Bengali", 2),
  L("ur", "اردو", "Urdu", 2, "rtl"),
  L("fil", "Filipino", "Filipino", 2),
  L("pt-PT", "Português (Portugal)", "Portuguese (Portugal)", 2),
  L("zh-Hant", "繁體中文", "Chinese (Traditional)", 2),
  L("sk", "Slovenčina", "Slovak", 2),
  L("bg", "Български", "Bulgarian", 2),
  L("hr", "Hrvatski", "Croatian", 2),
  L("sr", "Српски", "Serbian", 2),
  L("ta", "தமிழ்", "Tamil", 2),
  // Priority 3 (10)
  L("ca", "Català", "Catalan", 3),
  L("lt", "Lietuvių", "Lithuanian", 3),
  L("lv", "Latviešu", "Latvian", 3),
  L("et", "Eesti", "Estonian", 3),
  L("sl", "Slovenščina", "Slovenian", 3),
  L("sw", "Kiswahili", "Swahili", 3),
  L("te", "తెలుగు", "Telugu", 3),
  L("mr", "मराठी", "Marathi", 3),
  L("gu", "ગુજરાતી", "Gujarati", 3),
  L("af", "Afrikaans", "Afrikaans", 3),
];

export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "wc-locale";

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));
const BY_PREFIX = new Map(LOCALES.map((l) => [l.prefix, l]));

export function localeInfo(code: string | null | undefined): LocaleInfo {
  return (code && BY_CODE.get(code)) || BY_CODE.get(DEFAULT_LOCALE)!;
}

/** The locale for a URL segment ("pt-br" → pt-BR), or null. Case-sensitive: prefixes are lower case. */
export function localeFromPrefix(segment: string): LocaleInfo | null {
  return BY_PREFIX.get(segment) ?? null;
}

/** A known locale code in any letter case ("PT-br" → "pt-BR"), or null. */
export function normalizeLocale(value: string | null | undefined): string | null {
  if (!value) return null;
  return BY_PREFIX.get(value.trim().toLowerCase())?.code ?? null;
}

/** "/es/app/x" → { locale: "es", path: "/app/x" }; unprefixed paths are English. */
export function splitLocalePath(pathname: string): { locale: string; path: string; prefixed: boolean } {
  const seg = pathname.split("/")[1] ?? "";
  const info = seg ? localeFromPrefix(seg) : null;
  if (!info || info.code === DEFAULT_LOCALE) return { locale: DEFAULT_LOCALE, path: pathname, prefixed: false };
  const rest = pathname.slice(seg.length + 1);
  return { locale: info.code, path: rest.startsWith("/") ? rest : `/${rest}`, prefixed: true };
}

/**
 * Paths that are never localised: APIs, media, ad frames, files for crawlers and services,
 * the outbound redirect's API and the offline page cached by the service worker.
 */
export function isLocalizablePath(path: string): boolean {
  return !/^\/(api|media|ads|_next|account-export|e2e-test|offline)(\/|$)/.test(path)
    && !/^\/(sitemap\.xml|robots\.txt|ads\.txt|indexnow-key\.txt|manifest\.webmanifest|sw\.js|BingSiteAuth\.xml)$/.test(path)
    && !/^\/google[0-9a-f]{8,32}\.html$/.test(path)
    && !/\.[a-z0-9]{2,5}$/i.test(path);
}

/** "/app/x" in Spanish → "/es/app/x". English and non-localisable paths are unchanged. */
export function localizePath(path: string, locale: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const info = localeInfo(locale);
  const [pathname, ...rest] = path.split(/(?=[?#])/);
  if (info.code === DEFAULT_LOCALE || !isLocalizablePath(pathname!)) return path;
  return `/${info.prefix}${pathname === "/" ? "" : pathname}${rest.join("")}`;
}

/**
 * Best supported language from a browser's preferences (Accept-Language or navigator.languages),
 * among `allowed`. Used only to SUGGEST a language; it never redirects.
 */
export function matchLanguage(preferences: readonly string[], allowed: readonly string[]): string | null {
  const set = new Set(allowed);
  for (const raw of preferences) {
    const pref = raw.trim();
    if (!pref) continue;
    const exact = normalizeLocale(pref);
    if (exact && set.has(exact)) return exact;
    const lower = pref.toLowerCase();
    // Script/region fallbacks: zh-TW/zh-HK → Traditional, other zh → Simplified, pt → Brazil, no/nn → Bokmål.
    if (lower.startsWith("zh")) { const z = /^zh-(tw|hk|mo|hant)/.test(lower) ? "zh-Hant" : "zh-Hans"; if (set.has(z)) return z; continue; }
    if (lower.startsWith("pt")) { const p = lower === "pt-pt" ? "pt-PT" : "pt-BR"; if (set.has(p)) return p; continue; }
    if (/^(no|nn)\b/.test(lower) && set.has("nb")) return "nb";
    const base = normalizeLocale(lower.split("-")[0]);
    if (base && set.has(base)) return base;
  }
  return null;
}

export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header.split(",").map((part) => {
    const [tag, q] = part.trim().split(";q=");
    return { tag: tag!.trim(), q: q ? Number(q) : 1 };
  }).filter((x) => x.tag && x.tag !== "*" && Number.isFinite(x.q) && x.q > 0).sort((a, b) => b.q - a.q).map((x) => x.tag).slice(0, 10);
}

/** Codes from an admin text list ("es, fr de"), keeping only known locales, in registry order. */
export function parseLocaleList(value: string): string[] {
  const wanted = new Set(value.split(/[\s,]+/).map(normalizeLocale).filter((x): x is string => Boolean(x)));
  wanted.add(DEFAULT_LOCALE);
  return LOCALES.filter((l) => wanted.has(l.code)).map((l) => l.code);
}
