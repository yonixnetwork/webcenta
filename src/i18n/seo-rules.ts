import { DEFAULT_LOCALE, localeInfo, localizePath } from "./locales";

/**
 * Keywords for one language: at most 10, 2–50 characters, no duplicates, no URLs or markup.
 * Keywords are only used for the admin's own planning and the keywords meta tag of the
 * homepage; search engines largely ignore that tag, so stuffing it never helps.
 */
export function validateKeywords(raw: string): { keywords: string[]; problems: string[] } {
  const parts = raw.split(/[\n,]+/).map((k) => k.trim().replace(/\s+/g, " ")).filter(Boolean);
  const problems: string[] = [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const k of parts) {
    const low = k.toLocaleLowerCase();
    if (seen.has(low)) { problems.push(`“${k}” is listed twice.`); continue; }
    seen.add(low);
    if (k.length < 2 || k.length > 50) problems.push(`“${k.slice(0, 50)}” must be 2–50 characters.`);
    else if (/[<>{}]|https?:\/\//i.test(k)) problems.push(`“${k}” must be plain words (no links or markup).`);
    else keywords.push(k);
  }
  if (keywords.length > 10) problems.push(`Use at most 10 keywords (you entered ${keywords.length}).`);
  return { keywords: keywords.slice(0, 10), problems };
}

/**
 * Canonical URL and hreflang alternates for a page that exists in every indexed language.
 * Reciprocal by construction: every language version lists the same set (itself included)
 * plus x-default (English, the unprefixed URL).
 */
export function languageAlternates(path: string, current: string, indexed: readonly string[], origin = "") {
  const set = [...new Set([DEFAULT_LOCALE, ...indexed])];
  const languages: Record<string, string> = {};
  for (const code of set) languages[localeInfo(code).code] = origin + localizePath(path, code);
  languages["x-default"] = origin + path;
  const canonical = origin + localizePath(path, set.includes(current) ? current : DEFAULT_LOCALE);
  return { canonical, languages };
}

/** Problems with a set of alternates (used by the admin hreflang check and the tests). */
export function hreflangProblems(alternates: Record<string, Record<string, string>>): string[] {
  const problems: string[] = [];
  const pages = Object.entries(alternates);
  for (const [url, langs] of pages) {
    if (!langs["x-default"]) problems.push(`${url}: no x-default`);
    for (const [code, target] of Object.entries(langs)) {
      if (code !== "x-default") {
        try { if (Intl.getCanonicalLocales(code)[0] !== code) problems.push(`${url}: ${code} is not a canonical BCP 47 tag`); }
        catch { problems.push(`${url}: ${code} is not a valid language tag`); }
      }
      const back = alternates[target];
      if (code !== "x-default" && back && !Object.values(back).includes(url)) problems.push(`${target} does not link back to ${url}`);
    }
  }
  return problems;
}
