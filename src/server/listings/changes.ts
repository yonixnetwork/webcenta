/**
 * What changed between the live listing and an approved revision, and whether it is worth telling
 * the people who saved the app. Metadata such as tags, languages, countries or support links is
 * recorded but never triggers a notification.
 */
export interface Comparable {
  name: string; tagline: string | null; description: string; features: string[]; websiteUrl: string;
  pricingModel: string; pricingDetails: string | null; platforms: string[]; ageRating: string;
  logoAssetId: string | null; screenshotAssetIds: string[]; tags?: string[]; languages?: string[]; supportedCountries?: string[];
}

export const MEANINGFUL_FIELDS = new Set(["name", "description", "features", "websiteUrl", "pricing", "platforms", "screenshots", "logo", "tagline", "ageRating"]);

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const sameList = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Words changed between two texts, as a share of the longer one (0 = identical). */
function textChange(a: string, b: string): number {
  const wa = norm(a).split(" ").filter(Boolean), wb = norm(b).split(" ").filter(Boolean);
  const setB = new Set(wb);
  const common = wa.filter((w) => setB.has(w)).length;
  return 1 - common / Math.max(1, Math.max(wa.length, wb.length));
}

export function changedFields(before: Comparable, after: Comparable): string[] {
  const out: string[] = [];
  if (norm(before.name) !== norm(after.name)) out.push("name");
  if (norm(before.tagline) !== norm(after.tagline)) out.push("tagline");
  // Typo fixes and reflowed whitespace are not an update; a rewritten paragraph is.
  if (norm(before.description) !== norm(after.description) && (textChange(before.description, after.description) >= 0.1 || Math.abs(after.description.length - before.description.length) >= 80)) out.push("description");
  if (!sameList(before.features.map(norm), after.features.map(norm))) out.push("features");
  if (before.websiteUrl !== after.websiteUrl) out.push("websiteUrl");
  if (before.pricingModel !== after.pricingModel || norm(before.pricingDetails) !== norm(after.pricingDetails)) out.push("pricing");
  if (!sameList([...before.platforms].sort(), [...after.platforms].sort())) out.push("platforms");
  if (before.ageRating !== after.ageRating) out.push("ageRating");
  if ((before.logoAssetId ?? null) !== (after.logoAssetId ?? null)) out.push("logo");
  if (!sameList(before.screenshotAssetIds, after.screenshotAssetIds)) out.push("screenshots");
  if (!sameList([...(before.tags ?? [])].sort(), [...(after.tags ?? [])].sort())) out.push("tags");
  if (!sameList([...(before.languages ?? [])].sort(), [...(after.languages ?? [])].sort())) out.push("languages");
  if (!sameList([...(before.supportedCountries ?? [])].sort(), [...(after.supportedCountries ?? [])].sort())) out.push("countries");
  return out;
}

/** Worth a notification: at least one user-visible field changed (a summary alone is not enough). */
export const isMeaningful = (fields: string[]) => fields.some((f) => MEANINGFUL_FIELDS.has(f));

const LABEL: Record<string, string> = { name: "name", tagline: "tagline", description: "description", features: "features", websiteUrl: "website address", pricing: "pricing", platforms: "platforms", ageRating: "age rating", logo: "logo", screenshots: "screenshots" };

/** A short line for the notification when the developer wrote no summary. */
export function describeChanges(fields: string[]): string {
  const m = fields.filter((f) => MEANINGFUL_FIELDS.has(f)).map((f) => LABEL[f] ?? f);
  if (!m.length) return "New details on Webcenta.";
  return `Updated ${m.length > 3 ? `${m.slice(0, 3).join(", ")} and more` : m.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}
