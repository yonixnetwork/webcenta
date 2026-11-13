import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/**
 * Daily roll-ups of ListingEvent (idempotent: a day can be recomputed any time).
 * "Unique" counts are distinct daily visitor hashes; multi-day "unique" totals
 * are sums of daily uniques and are labelled as such in the UI.
 */
export function dayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function rollupDay(day: Date): Promise<number> {
  const from = dayStart(day);
  const to = new Date(from.getTime() + 86_400_000);
  return db.$transaction(async (tx) => {
    await tx.listingDailyStat.deleteMany({ where: { date: from } });
    await tx.listingDailyDimensionStat.deleteMany({ where: { date: from } });
    const day = from.toISOString().slice(0, 10);
    const n = await tx.$executeRaw`
      INSERT INTO ListingDailyStat (listingId, date, views, uniqueVisitors, outboundClicks, uniqueOutboundClicks, searchImpressions)
      SELECT listingId, ${day},
        SUM(CASE WHEN type = 'VIEW' THEN 1 ELSE 0 END),
        COUNT(DISTINCT CASE WHEN type = 'VIEW' THEN visitorHash END),
        SUM(CASE WHEN type = 'OUTBOUND_CLICK' THEN 1 ELSE 0 END),
        COUNT(DISTINCT CASE WHEN type = 'OUTBOUND_CLICK' THEN visitorHash END),
        SUM(CASE WHEN type = 'SEARCH_IMPRESSION' THEN 1 ELSE 0 END)
      FROM ListingEvent
      WHERE occurredAt >= ${from} AND occurredAt < ${to} AND device <> 'BOT'
      GROUP BY listingId`;
    for (const [dim, col] of [["COUNTRY", Prisma.sql`COALESCE(countryCode, 'unknown')`], ["DEVICE", Prisma.sql`CAST(device AS CHAR)`], ["REFERRER", Prisma.sql`COALESCE(referrerHost, 'direct / webcenta')`]] as const) {
      await tx.$executeRaw`
        INSERT INTO ListingDailyDimensionStat (listingId, date, dimension, \`key\`, views, outboundClicks)
        SELECT listingId, ${day}, ${dim}, ${col},
          SUM(CASE WHEN type = 'VIEW' THEN 1 ELSE 0 END), SUM(CASE WHEN type = 'OUTBOUND_CLICK' THEN 1 ELSE 0 END)
        FROM ListingEvent
        WHERE occurredAt >= ${from} AND occurredAt < ${to} AND device <> 'BOT' AND type IN ('VIEW', 'OUTBOUND_CLICK')
        GROUP BY listingId, 4`;
    }
    return n;
  });
}

/** Recomputes each listing's public visit total (sum of daily unique outbound clicks). */
export async function refreshVisitCounts(): Promise<number> {
  return db.$executeRaw`
    UPDATE Listing l
    JOIN (SELECT listingId, SUM(uniqueOutboundClicks) AS visits FROM ListingDailyStat GROUP BY listingId) s ON s.listingId = l.id
    SET l.visitCount = s.visits
    WHERE l.visitCount <> s.visits`;
}

export interface SeriesPoint { date: string; views: number; uniqueVisitors: number; outboundClicks: number; uniqueOutboundClicks: number; searchImpressions: number }
export interface Breakdown { key: string; views: number; outboundClicks: number }

const SUPPRESS_BELOW = 5;

/** Aggregates for a set of listings over [from, to). Small buckets are merged into "Other (<5 each)". */
export async function listingStats(listingIds: string[], days: number) {
  const to = new Date(dayStart(new Date()).getTime() + 86_400_000);
  const from = new Date(to.getTime() - days * 86_400_000);
  const where = { listingId: { in: listingIds }, date: { gte: from, lt: to } };
  const [daily, dims, perListing] = await Promise.all([
    db.listingDailyStat.groupBy({ by: ["date"], where, _sum: { views: true, uniqueVisitors: true, outboundClicks: true, uniqueOutboundClicks: true, searchImpressions: true }, orderBy: { date: "asc" } }),
    db.listingDailyDimensionStat.groupBy({ by: ["dimension", "key"], where, _sum: { views: true, outboundClicks: true } }),
    db.listingDailyStat.groupBy({ by: ["listingId"], where, _sum: { views: true, outboundClicks: true, uniqueVisitors: true, uniqueOutboundClicks: true } }),
  ]);
  const byDate = new Map(daily.map((d) => [d.date.toISOString().slice(0, 10), d._sum]));
  const series: SeriesPoint[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += 86_400_000) {
    const k = new Date(t).toISOString().slice(0, 10);
    const s = byDate.get(k);
    series.push({ date: k, views: s?.views ?? 0, uniqueVisitors: s?.uniqueVisitors ?? 0, outboundClicks: s?.outboundClicks ?? 0, uniqueOutboundClicks: s?.uniqueOutboundClicks ?? 0, searchImpressions: s?.searchImpressions ?? 0 });
  }
  const totals = series.reduce((a, p) => ({ views: a.views + p.views, uniqueVisitors: a.uniqueVisitors + p.uniqueVisitors, outboundClicks: a.outboundClicks + p.outboundClicks,
    uniqueOutboundClicks: a.uniqueOutboundClicks + p.uniqueOutboundClicks, searchImpressions: a.searchImpressions + p.searchImpressions }),
  { views: 0, uniqueVisitors: 0, outboundClicks: 0, uniqueOutboundClicks: 0, searchImpressions: 0 });
  const breakdown = (dim: "COUNTRY" | "DEVICE" | "REFERRER"): Breakdown[] => {
    const rows = dims.filter((d) => d.dimension === dim).map((d) => ({ key: d.key, views: d._sum.views ?? 0, outboundClicks: d._sum.outboundClicks ?? 0 }));
    const shown = rows.filter((r) => r.views >= SUPPRESS_BELOW || r.outboundClicks >= SUPPRESS_BELOW);
    const other = rows.filter((r) => !shown.includes(r));
    const out = shown.sort((a, b) => b.views - a.views);
    if (other.length) out.push({ key: "Other (<5 each)", views: other.reduce((a, r) => a + r.views, 0), outboundClicks: other.reduce((a, r) => a + r.outboundClicks, 0) });
    return out;
  };
  return {
    from, to, series, totals,
    ctr: totals.views ? totals.outboundClicks / totals.views : 0,
    countries: breakdown("COUNTRY"), devices: breakdown("DEVICE"), referrers: breakdown("REFERRER"),
    perListing: perListing.map((p) => ({ listingId: p.listingId, views: p._sum.views ?? 0, outboundClicks: p._sum.outboundClicks ?? 0, uniqueVisitors: p._sum.uniqueVisitors ?? 0, uniqueOutboundClicks: p._sum.uniqueOutboundClicks ?? 0 })),
  };
}

/** Platform-wide figures for the admin portal. */
export async function platformStats(days: number) {
  const to = new Date(dayStart(new Date()).getTime() + 86_400_000);
  const from = new Date(to.getTime() - days * 86_400_000);
  const ids = (await db.listingDailyStat.findMany({ where: { date: { gte: from, lt: to } }, select: { listingId: true }, distinct: ["listingId"] })).map((r) => r.listingId);
  const listing = await listingStats(ids, days);
  const [userGrowth, devGrowth, searches, zero, topCategories] = await Promise.all([
    db.$queryRaw<Array<{ d: Date; n: bigint }>>`SELECT DATE(createdAt) d, COUNT(*) n FROM User WHERE createdAt >= ${from} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Array<{ d: Date; n: bigint }>>`SELECT DATE(createdAt) d, COUNT(*) n FROM DeveloperOrg WHERE createdAt >= ${from} GROUP BY 1 ORDER BY 1`,
    db.searchQueryDailyStat.groupBy({ by: ["query"], where: { date: { gte: from } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } }, take: 15 }),
    db.searchQueryDailyStat.groupBy({ by: ["query"], where: { date: { gte: from }, zeroResults: { gt: 0 } }, _sum: { zeroResults: true }, orderBy: { _sum: { zeroResults: "desc" } }, take: 10 }),
    db.$queryRaw<Array<{ name: string; views: bigint; clicks: bigint }>>`
      SELECT COALESCE(p.name, c.name) name, SUM(s.views) views, SUM(s.outboundClicks) clicks
      FROM ListingDailyStat s JOIN Listing l ON l.id = s.listingId JOIN Category c ON c.id = l.primaryCategoryId LEFT JOIN Category p ON p.id = c.parentId
      WHERE s.date >= ${from} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
  ]);
  const mostViewed = [...listing.perListing].sort((a, b) => b.views - a.views).slice(0, 10);
  const mostVisited = [...listing.perListing].filter((p) => p.uniqueOutboundClicks > 0).sort((a, b) => b.uniqueOutboundClicks - a.uniqueOutboundClicks).slice(0, 10);
  const names = await db.listing.findMany({ where: { id: { in: [...mostViewed, ...mostVisited].map((p) => p.listingId) } }, select: { id: true, name: true } });
  const named = <T extends { listingId: string }>(p: T) => ({ ...p, name: names.find((t) => t.id === p.listingId)?.name ?? "?" });
  return {
    ...listing,
    topListings: mostViewed.map(named),
    mostVisited: mostVisited.map(named),
    userGrowth: userGrowth.map((r) => ({ date: r.d.toISOString().slice(0, 10), count: Number(r.n) })),
    developerGrowth: devGrowth.map((r) => ({ date: r.d.toISOString().slice(0, 10), count: Number(r.n) })),
    topSearches: searches.map((s) => ({ query: s.query, count: s._sum.count ?? 0 })),
    zeroResultSearches: zero.map((s) => ({ query: s.query, count: s._sum.zeroResults ?? 0 })),
    topCategories: topCategories.map((c) => ({ name: c.name, views: Number(c.views), clicks: Number(c.clicks) })),
  };
}
