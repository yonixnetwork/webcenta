import { stringArray } from "@/lib/json-arrays";
import { trigramTokens } from "@/lib/trigrams";

/**
 * Derived search columns on Listing (MySQL/MariaDB FULLTEXT):
 *  - searchText: name, tagline, publisher, features and description;
 *  - searchTrigrams: trigram tokens of the name and publisher (typo tolerance).
 * Kept in sync by the Prisma client extension in src/server/db.ts and
 * reconciled by the hourly maintenance job.
 */
export const SEARCH_SOURCE_FIELDS = ["name", "tagline", "publisherName", "features", "description"] as const;
export type SearchSource = { name: string; tagline?: string | null; publisherName: string; features?: unknown; description: string };

export function searchDocument(l: SearchSource): { searchText: string; searchTrigrams: string } {
  const searchText = [l.name, l.tagline ?? "", l.publisherName, ...stringArray(l.features), l.description]
    .filter(Boolean)
    .join("\n")
    .slice(0, 60_000);
  return { searchText, searchTrigrams: trigramTokens(`${l.name} ${l.publisherName}`) };
}

/** Unwraps Prisma update values ({ set: x } or x). */
export function plainValue(v: unknown): unknown {
  return v && typeof v === "object" && !Array.isArray(v) && "set" in (v as Record<string, unknown>) ? (v as { set: unknown }).set : v;
}

export function touchesSearchFields(data: Record<string, unknown> | undefined): boolean {
  return Boolean(data && SEARCH_SOURCE_FIELDS.some((f) => f in data));
}

/**
 * Re-derives search columns for listings changed in the last `hours` (or never
 * indexed). Repairs anything a write path missed. Returns the number fixed.
 */
export async function reconcileSearchDocuments(db: {
  listing: {
    findMany(args: unknown): Promise<Array<SearchSource & { id: string; searchText: string | null; searchTrigrams: string | null }>>;
  };
  $executeRaw(q: TemplateStringsArray, ...v: unknown[]): Promise<number>;
}, hours = 3): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db.listing.findMany({
    where: { OR: [{ updatedAt: { gte: since } }, { searchText: null }, { searchTrigrams: null }] },
    select: { id: true, name: true, tagline: true, publisherName: true, features: true, description: true, searchText: true, searchTrigrams: true },
    take: 2000,
  });
  let fixed = 0;
  for (const r of rows) {
    const d = searchDocument(r);
    if (d.searchText === r.searchText && d.searchTrigrams === r.searchTrigrams) continue;
    // Raw UPDATE: does not touch updatedAt and bypasses the client extension.
    await db.$executeRaw`UPDATE Listing SET searchText = ${d.searchText}, searchTrigrams = ${d.searchTrigrams} WHERE id = ${r.id}`;
    fixed++;
  }
  return fixed;
}
