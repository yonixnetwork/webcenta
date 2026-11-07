import { db } from "@/server/db";

/**
 * Organic ranking scores computed from real, on-platform signals only.
 * Sponsored placements are never inputs. Weights are admin-configurable
 * (SystemSetting "ranking.weights"); every change is audited.
 */
export const DEFAULT_WEIGHTS = { views: 1, uniqueVisitors: 2, outboundClicks: 4, favorites: 6, ratingBayes: 10, trendingHalfLifeDays: 3 };
export type RankingWeights = typeof DEFAULT_WEIGHTS;

export async function rankingWeights(): Promise<RankingWeights> {
  const row = await db.systemSetting.findUnique({ where: { key: "ranking.weights" } });
  return { ...DEFAULT_WEIGHTS, ...((row?.value as Partial<RankingWeights>) ?? {}) };
}

/** Bayesian average: pulls listings with few ratings towards the global mean. */
export function bayesian(avg: number, count: number, globalMean: number, m = 10): number {
  return (count * avg + m * globalMean) / (count + m);
}

export async function recomputeScores(now = new Date()): Promise<number> {
  const w = await rankingWeights();
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since14 = new Date(now.getTime() - 14 * 86_400_000);
  const [listings, stats30, daily14, globalAgg] = await Promise.all([
    db.listing.findMany({ where: { status: "PUBLISHED" }, select: { id: true, favoriteCount: true, ratingAverage: true, ratingCount: true } }),
    db.listingDailyStat.groupBy({ by: ["listingId"], where: { date: { gte: since30 } }, _sum: { views: true, uniqueVisitors: true, outboundClicks: true } }),
    db.listingDailyStat.findMany({ where: { date: { gte: since14 } }, select: { listingId: true, date: true, uniqueVisitors: true, outboundClicks: true } }),
    db.review.aggregate({ where: { status: "PUBLISHED" }, _avg: { rating: true } }),
  ]);
  const globalMean = globalAgg._avg.rating ?? 3.5;
  const s30 = new Map(stats30.map((s) => [s.listingId, s._sum]));
  const trend = new Map<string, number>();
  for (const d of daily14) {
    const ageDays = (now.getTime() - d.date.getTime()) / 86_400_000;
    const decay = Math.pow(0.5, ageDays / w.trendingHalfLifeDays);
    trend.set(d.listingId, (trend.get(d.listingId) ?? 0) + decay * (d.uniqueVisitors * w.uniqueVisitors + d.outboundClicks * w.outboundClicks));
  }
  let n = 0;
  for (const l of listings) {
    const s = s30.get(l.id);
    const engagement = (s?.views ?? 0) * w.views + (s?.uniqueVisitors ?? 0) * w.uniqueVisitors + (s?.outboundClicks ?? 0) * w.outboundClicks + l.favoriteCount * w.favorites;
    const quality = l.ratingCount > 0 ? (bayesian(l.ratingAverage, l.ratingCount, globalMean) - globalMean) * w.ratingBayes * Math.log10(1 + l.ratingCount) : 0;
    const popularity = Math.max(0, Math.log1p(engagement) * 10 + quality);
    const trending = Math.max(0, Math.log1p(trend.get(l.id) ?? 0) * 10);
    await db.listing.update({ where: { id: l.id }, data: { popularityScore: engagement > 0 || l.ratingCount > 0 ? popularity : 0, trendingScore: trending } });
    n++;
  }
  return n;
}
