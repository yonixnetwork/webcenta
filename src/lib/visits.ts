/** Public visit milestones: nothing below 500, then only thresholds that were actually reached. */
const MILESTONES = [1_000_000, 500_000, 100_000, 50_000, 10_000, 5_000, 1_000, 500];

export function visitMilestone(count: number): string | null {
  const m = MILESTONES.find((x) => count >= x);
  if (!m) return null;
  return `${m >= 1_000_000 ? `${m / 1_000_000}M` : m >= 1_000 ? `${m / 1_000}K` : m}+ visits`;
}
