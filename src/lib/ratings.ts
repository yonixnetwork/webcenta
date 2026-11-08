/**
 * Pure rating maths shared by the review summary, cards and tests.
 * Only published reviews are ever passed in; nothing here invents data.
 */
export interface StarCount { rating: number; count: number }

export interface RatingSummary {
  total: number;
  /** Mean rating rounded to one decimal, or null when there are no ratings. */
  average: number | null;
  /** Rows for 5 → 1 stars with counts and whole-number percentages that sum to 100 (or all 0). */
  rows: Array<{ rating: number; count: number; percent: number }>;
}

export function summarizeRatings(distribution: StarCount[]): RatingSummary {
  const counts = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: distribution.filter((d) => d.rating === r).reduce((s, d) => s + Math.max(0, Math.trunc(d.count)), 0),
  }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (total === 0) return { total: 0, average: null, rows: counts.map((c) => ({ ...c, percent: 0 })) };
  const sum = counts.reduce((s, c) => s + c.rating * c.count, 0);
  const average = Math.round((sum / total) * 10) / 10;
  // Largest-remainder rounding so the displayed percentages add up to exactly 100.
  const raw = counts.map((c) => (c.count / total) * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    if (counts[i]!.count > 0) { floors[i]!++; remaining--; }
  }
  return { total, average, rows: counts.map((c, i) => ({ ...c, percent: floors[i]! })) };
}

/** "4.8/5" style label. */
export function formatAverage(avg: number): string {
  return `${avg.toFixed(1)}/5`;
}

/** "Based on 1 review" / "Based on 12 reviews". */
export function basedOnLabel(total: number): string {
  return `Based on ${total.toLocaleString("en")} review${total === 1 ? "" : "s"}`;
}

/** Fill fraction (0–1) of each of five stars for an average rating. */
export function starFills(avg: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, avg - i)));
}
