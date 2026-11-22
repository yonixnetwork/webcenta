import type { Catalog, MessageValue } from "./translate";

export interface CatalogProblem { key: string; problem: string }

const placeholders = (v: MessageValue | undefined): string[] => {
  const texts = typeof v === "string" ? [v] : v ? Object.values(v).filter((x): x is string => typeof x === "string") : [];
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!)))].sort();
};

/**
 * Compares one language's catalogue with English: missing keys, keys English does not have,
 * placeholders that differ, empty values and markup (translations are plain text; anything that
 * looks like HTML is rejected so a translation can never inject markup).
 */
export function checkCatalog(en: Catalog, other: Catalog): { total: number; translated: number; missing: string[]; problems: CatalogProblem[] } {
  const keys = Object.keys(en);
  const missing: string[] = [];
  const problems: CatalogProblem[] = [];
  let translated = 0;
  for (const key of keys) {
    const v = other[key];
    if (v === undefined) { missing.push(key); continue; }
    const texts = typeof v === "string" ? [v] : Object.values(v).filter((x): x is string => typeof x === "string");
    // Keys ending in Before/After are sentence fragments around highlighted words and may be empty.
    if (!texts.length || (texts.some((t) => !t.trim()) && !/(Before|After)$/.test(key))) { problems.push({ key, problem: "empty value" }); continue; }
    if (texts.some((t) => /<[a-z/!]|javascript:|on\w+=/i.test(t))) { problems.push({ key, problem: "contains markup" }); continue; }
    if (typeof en[key] !== typeof v) { problems.push({ key, problem: "plural forms do not match English" }); continue; }
    if (placeholders(en[key]).join() !== placeholders(v).join()) { problems.push({ key, problem: `placeholders differ (expected ${placeholders(en[key]).map((p) => `{${p}}`).join(" ") || "none"})` }); continue; }
    translated++;
  }
  for (const key of Object.keys(other)) if (!(key in en)) problems.push({ key, problem: "not in English (unused)" });
  return { total: keys.length, translated, missing, problems };
}
