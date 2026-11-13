/** Time helpers (kept out of component bodies so render functions stay pure for the linter). */
export const nowMs = () => Date.now();
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
export const minutesSince = (d: Date) => (Date.now() - d.getTime()) / 60_000;
/** Start of the next scheduling window of `minutes` (recurring jobs are enqueued once per window). */
export const nextWindow = (minutes: number) => new Date((Math.floor(Date.now() / (minutes * 60_000)) + 1) * minutes * 60_000);
