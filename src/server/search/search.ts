import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { cardSelect, MIN_RATINGS_FOR_DISPLAY, type ListingCard } from "@/server/catalog/listings";
import { publicListingWhere } from "@/server/catalog/visibility";
import { cleanText, escapeLike, mysqlSearchTerms, normalizeQueryForStats, wordPattern, type SearchFilters } from "@/lib/search-params";
import { similarity, trigramTokens } from "@/lib/trigrams";

/**
 * Search provider (MySQL/MariaDB FULLTEXT + trigram typo tolerance; see
 * src/server/search/document.ts). The interface is deliberately small
 * so it can be swapped for Meilisearch/Typesense on a VPS without touching pages.
 */
export const PAGE_SIZE = 24;
const MAX_TEXT_CANDIDATES = 500;
const RECENT_DAYS = 30;

export interface SearchResult {
  items: ListingCard[];
  total: number;
  page: number;
  pageCount: number;
  /** True when the text match hit the candidate cap (results truncated). */
  truncated: boolean;
}

export function filtersWhere(f: SearchFilters, now = new Date()): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [];
  if (f.category) {
    and.push({ categories: { some: { category: { OR: [{ slug: f.category }, { parent: { slug: f.category } }] } } } });
  }
  if (f.pricing.length) and.push({ pricingModel: { in: f.pricing } });
  // JSON arrays (MySQL has no array columns): JSON_CONTAINS via Prisma's array_contains.
  if (f.platform) and.push({ platforms: { array_contains: [f.platform] } });
  if (f.country) and.push({ OR: [{ supportedCountries: { array_contains: [f.country] } }, { supportedCountries: { equals: [] } }] });
  if (f.openSource) and.push({ isOpenSource: true });
  if (f.browserBased) and.push({ isBrowserBased: true });
  if (f.mobileFriendly) and.push({ isMobileFriendly: true });
  if (f.pwa) and.push({ isPwaInstallable: true });
  if (f.verified) and.push({ developer: { verificationLevel: { in: ["DOMAIN_VERIFIED", "BUSINESS_VERIFIED"] } } });
  if (f.recentlyUpdated) and.push({ contentUpdatedAt: { gte: new Date(now.getTime() - RECENT_DAYS * 86_400_000) } });
  if (f.highlyRated) and.push({ ratingCount: { gte: MIN_RATINGS_FOR_DISPLAY }, ratingAverage: { gte: 4 } });
  return and.length ? { AND: and } : {};
}

function orderFor(sort: SearchFilters["sort"]): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "updated":
      return [{ contentUpdatedAt: { sort: "desc", nulls: "last" } }, { publishedAt: "desc" }];
    case "rating":
      return [{ ratingAverage: "desc" }, { ratingCount: "desc" }, { name: "asc" }];
    case "name":
      return [{ name: "asc" }];
    case "newest":
    default:
      return [{ publishedAt: "desc" }, { name: "asc" }];
  }
}

/** Names count as typo matches above this trigram similarity (pg_trgm's default threshold). */
const FUZZY_THRESHOLD = 0.3;

/**
 * Text-match candidates with a relevance score. Visibility is applied afterwards.
 * Matches: FULLTEXT on the search document (every word, as a prefix), short words
 * (1–2 characters) as whole words, name/publisher substrings, tag and category
 * names, and typo-tolerant name matches (trigram similarity > 0.3).
 */
export async function textCandidates(rawQ: string, limit = MAX_TEXT_CANDIDATES): Promise<Array<{ id: string; rank: number }>> {
  const q = cleanText(rawQ);
  if (!q) return [];
  const { boolean, shortWords } = mysqlSearchTerms(q);
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const trigrams = trigramTokens(q, 60);

  // Word match: all long words via FULLTEXT, all short words via whole-word REGEXP.
  const parts: Prisma.Sql[] = [];
  if (boolean) parts.push(Prisma.sql`MATCH(l.searchText) AGAINST (${boolean} IN BOOLEAN MODE)`);
  for (const w of shortWords) parts.push(Prisma.sql`l.searchText REGEXP ${wordPattern(w)}`);
  const wordMatch = parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`FALSE`;
  const ftScore = boolean ? Prisma.sql`MATCH(l.searchText) AGAINST (${boolean} IN BOOLEAN MODE)` : Prisma.sql`0`;
  const nameScore = boolean ? Prisma.sql`MATCH(l.name) AGAINST (${boolean} IN BOOLEAN MODE)` : Prisma.sql`0`;
  const fuzzy = trigrams ? Prisma.sql`MATCH(l.searchTrigrams) AGAINST (${trigrams} IN NATURAL LANGUAGE MODE)` : Prisma.sql`0`;
  const tagMatch = Prisma.sql`EXISTS (SELECT 1 FROM ListingTag lt JOIN Tag t ON t.id = lt.tagId WHERE lt.listingId = l.id AND t.name LIKE ${like})`;
  const catMatch = Prisma.sql`EXISTS (SELECT 1 FROM ListingCategory lc JOIN Category c ON c.id = lc.categoryId WHERE lc.listingId = l.id AND c.name LIKE ${like})`;

  // Collations are case-insensitive, so = and LIKE ignore case (as ILIKE did).
  const rows = await db.$queryRaw<Array<{ id: string; name: string; publisherName: string; strong: number | bigint; score: number }>>`
    SELECT l.id, l.name, l.publisherName,
      ((${wordMatch}) OR l.name LIKE ${like} OR l.publisherName LIKE ${like} OR ${tagMatch} OR ${catMatch}) AS strong,
      (LEAST(${ftScore}, 10) * 0.4 + LEAST(${nameScore}, 10) * 0.6
        + CASE WHEN l.name = ${q} THEN 6 WHEN l.name LIKE ${prefix} THEN 2 ELSE 0 END
        + CASE WHEN ${tagMatch} THEN 1 ELSE 0 END
        + CASE WHEN ${catMatch} THEN 1 ELSE 0 END) AS score
    FROM Listing l
    WHERE l.status = 'PUBLISHED' AND l.deletedAt IS NULL AND (
      (${wordMatch}) OR l.name LIKE ${like} OR l.publisherName LIKE ${like}
      OR ${fuzzy} > 0 OR ${tagMatch} OR ${catMatch}
    )
    ORDER BY score DESC, l.name ASC
    LIMIT ${limit * 2}`;

  return rows
    .map((r) => {
      const sim = similarity(r.name, q);
      return { id: r.id, name: r.name, keep: Number(r.strong) > 0 || sim > FUZZY_THRESHOLD, rank: Number(r.score) + sim * 3 };
    })
    .filter((r) => r.keep)
    .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, rank }) => ({ id, rank }));
}

export async function searchListings(ctx: ViewerContext, f: SearchFilters): Promise<SearchResult> {
  const where: Prisma.ListingWhereInput = { AND: [publicListingWhere(ctx), filtersWhere(f)] };
  const page = f.page;

  if (!f.q) {
    const [total, items] = await Promise.all([
      db.listing.count({ where }),
      db.listing.findMany({ where, orderBy: orderFor(f.sort), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: cardSelect }),
    ]);
    return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), truncated: false };
  }

  const candidates = await textCandidates(f.q);
  const rankById = new Map(candidates.map((c) => [c.id, c.rank]));
  const visible = await db.listing.findMany({
    where: { AND: [where, { id: { in: candidates.map((c) => c.id) } }] },
    select: cardSelect,
    ...(f.sort && f.sort !== "relevance" ? { orderBy: orderFor(f.sort) } : {}),
  });
  if (!f.sort || f.sort === "relevance") {
    visible.sort((a, b) => (rankById.get(b.id) ?? 0) - (rankById.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }
  const total = visible.length;
  return {
    items: visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    truncated: candidates.length >= MAX_TEXT_CANDIDATES,
  };
}

export interface Suggestions {
  apps: Array<{ slug: string; name: string; publisherName: string }>;
  categories: Array<{ slug: string; name: string }>;
}

export async function suggest(ctx: ViewerContext, q: string): Promise<Suggestions> {
  const query = cleanText(q).slice(0, 60);
  if (query.length < 1) return { apps: [], categories: [] };
  const candidates = await textCandidates(query, 40);
  const [apps, categories] = await Promise.all([
    db.listing.findMany({
      where: { AND: [publicListingWhere(ctx), { id: { in: candidates.map((c) => c.id) } }] },
      select: { id: true, slug: true, name: true, publisherName: true },
    }),
    db.category.findMany({
      where: { isEnabled: true, isRestricted: false, mergedIntoId: null, name: { contains: query },
        OR: [{ parentId: null }, { parent: { isEnabled: true, isRestricted: false } }] },
      select: { slug: true, name: true },
      orderBy: { sortOrder: "asc" },
      take: 4,
    }),
  ]);
  const rank = new Map(candidates.map((c) => [c.id, c.rank]));
  apps.sort((a, b) => (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0));
  return { apps: apps.slice(0, 6).map(({ slug, name, publisherName }) => ({ slug, name, publisherName })), categories };
}

/** Aggregated, de-identified search statistics (no user, IP or session stored). */
export async function recordSearchStat(q: string, resultCount: number): Promise<void> {
  const query = normalizeQueryForStats(q);
  if (!query) return;
  const date = new Date(new Date().toISOString().slice(0, 10));
  await db.searchQueryDailyStat.upsert({
    where: { date_query: { date, query } },
    create: { date, query, count: 1, zeroResults: resultCount === 0 ? 1 : 0 },
    update: { count: { increment: 1 }, ...(resultCount === 0 ? { zeroResults: { increment: 1 } } : {}) },
  });
}
