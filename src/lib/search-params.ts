import { z } from "zod";

/** Search/browse filters parsed leniently from URL query parameters. */
export const PRICING = ["FREE", "FREEMIUM", "PAID", "SUBSCRIPTION"] as const;
export const PLATFORMS = ["WEB", "ANDROID", "IOS", "WINDOWS", "MACOS", "LINUX", "BROWSER_EXTENSION"] as const;
export const SORTS = ["relevance", "newest", "updated", "rating", "name"] as const;
export type SortKey = (typeof SORTS)[number];

/** Removes NUL and other control characters (PostgreSQL rejects NUL in text). */
export function cleanText(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

const flag = z.preprocess((v) => v === "1" || v === "true", z.boolean()).catch(false);
const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : []),
    z.array(z.string()).transform((arr) => arr.filter((x): x is T[number] => (values as readonly string[]).includes(x))),
  );

export const filtersSchema = z.object({
  q: z.preprocess((v) => (typeof v === "string" ? cleanText(v).slice(0, 100) || undefined : undefined), z.string().optional()).catch(undefined),
  category: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().catch(undefined),
  pricing: list(PRICING).catch([]),
  platform: z.enum(PLATFORMS).optional().catch(undefined),
  country: z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).optional().catch(undefined),
  openSource: flag,
  browserBased: flag,
  mobileFriendly: flag,
  pwa: flag,
  verified: flag,
  recentlyUpdated: flag,
  highlyRated: flag,
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});

export type SearchFilters = z.infer<typeof filtersSchema>;

export function parseFilters(params: Record<string, string | string[] | undefined>): SearchFilters {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) && k !== "pricing" ? v[0] : v;
  return filtersSchema.parse(flat);
}

/** Builds a query string from filters, omitting defaults. */
export function filtersToQuery(f: Partial<SearchFilters>): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  if (f.pricing?.length) p.set("pricing", f.pricing.join(","));
  if (f.platform) p.set("platform", f.platform);
  if (f.country) p.set("country", f.country);
  for (const k of ["openSource", "browserBased", "mobileFriendly", "pwa", "verified", "recentlyUpdated", "highlyRated"] as const) {
    if (f[k]) p.set(k, "1");
  }
  if (f.sort) p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Tokens safe to embed in a to_tsquery prefix expression. */
export function queryTokens(q: string): string[] {
  return (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8).map((t) => t.slice(0, 40));
}

export function prefixTsQuery(q: string): string | null {
  const tokens = queryTokens(q);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Normalises a query for aggregate search statistics, or returns null for
 * queries that might contain personal data (emails, URLs, long numbers).
 */
export function normalizeQueryForStats(q: string): string | null {
  const n = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 60) return null;
  if (/@|https?:|www\.|\d{5,}/.test(n)) return null;
  return n;
}
