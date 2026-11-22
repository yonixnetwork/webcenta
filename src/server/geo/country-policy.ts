import { db } from "@/server/db";

export interface CountryRule {
  country: string;
  restrictedCategories: string[];
  permittedCategories: string[];
  adultAge: number | null;
  adsDisabled: boolean;
  disabledProviders: string[];
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

let cached: { at: number; rows: Map<string, CountryRule> } | null = null;
const TTL = 60_000;

/** All country policies, cached for a minute (the table is small and changes rarely). */
export async function countryRules(): Promise<Map<string, CountryRule>> {
  if (cached && Date.now() - cached.at < TTL) return cached.rows;
  const rows = await db.countryPolicy.findMany().catch(() => []);
  const map = new Map(rows.map((r) => [r.country, {
    country: r.country,
    restrictedCategories: strings(r.restrictedCategories),
    permittedCategories: strings(r.permittedCategories),
    adultAge: r.adultAge,
    adsDisabled: r.adsDisabled,
    disabledProviders: strings(r.disabledProviders),
  }]));
  cached = { at: Date.now(), rows: map };
  return map;
}

export function invalidateCountryRules() { cached = null; }

/**
 * The combined rule for a visitor. Restrictions only ever add up: the detected country and a
 * country the visitor chose themselves both apply, so choosing a country can never remove a
 * restriction that applies where the visitor is.
 */
export function combineRules(rules: Map<string, CountryRule>, countries: Array<string | null>): Omit<CountryRule, "country" | "permittedCategories"> {
  const list = [...new Set(countries.filter((c): c is string => Boolean(c)))].map((c) => rules.get(c)).filter((r): r is CountryRule => Boolean(r));
  return {
    restrictedCategories: [...new Set(list.flatMap((r) => r.restrictedCategories))],
    adultAge: list.reduce<number | null>((max, r) => (r.adultAge && (!max || r.adultAge > max) ? r.adultAge : max), null),
    adsDisabled: list.some((r) => r.adsDisabled),
    disabledProviders: [...new Set(list.flatMap((r) => r.disabledProviders))],
  };
}
