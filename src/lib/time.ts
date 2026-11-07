/** Time helpers (kept out of component bodies so render functions stay pure for the linter). */
export const nowMs = () => Date.now();
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
export const minutesSince = (d: Date) => (Date.now() - d.getTime()) / 60_000;
