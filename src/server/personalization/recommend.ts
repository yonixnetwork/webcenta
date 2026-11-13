import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import type { CurrentUser } from "@/server/auth/session";
import { cardsByIds, listCards, type ListingCard } from "@/server/catalog/listings";
import { relatedCandidateIds } from "@/server/catalog/alternatives";
import { publicListingWhere } from "@/server/catalog/visibility";

/**
 * Personal recommendations from real signals only (interests, views, favourites,
 * reviews). A diversity step reserves slots for categories outside the user's
 * top interests so recommendations do not trap people in one category.
 */
export interface PersonalRail { key: string; title: string; items: ListingCard[] }

export const DIVERSITY_SHARE = 0.25;

/** Interleaves exploit (interest) and explore (outside interests) items. Pure; unit tested. */
export function diversify<T extends { id: string }>(exploit: T[], explore: T[], size: number, share = DIVERSITY_SHARE): T[] {
  const nExplore = Math.min(explore.length, Math.max(1, Math.round(size * share)));
  const out: T[] = [];
  const seen = new Set<string>();
  const ex = exploit.filter((x) => !seen.has(x.id));
  let i = 0, j = 0;
  const every = Math.max(2, Math.floor(size / Math.max(1, nExplore)));
  while (out.length < size && (i < ex.length || j < nExplore)) {
    const pickExplore = j < nExplore && (out.length % every === every - 1 || i >= ex.length);
    const item = pickExplore ? explore[j++] : ex[i++];
    if (item && !seen.has(item.id)) { seen.add(item.id); out.push(item); }
  }
  // Not enough interest matches: backfill with further exploration items.
  for (let k = nExplore; out.length < size && k < explore.length; k++) {
    const item = explore[k]!;
    if (!seen.has(item.id)) { seen.add(item.id); out.push(item); }
  }
  return out;
}

export async function personalRails(user: CurrentUser, ctx: ViewerContext): Promise<PersonalRail[]> {
  if (!user.personalizationEnabled) return [];
  const [interests, favs, recent] = await Promise.all([
    db.userInterest.findMany({ where: { userId: user.id }, orderBy: { weight: "desc" } }),
    db.favorite.findMany({ where: { userId: user.id }, select: { listingId: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.interactionEvent.findMany({ where: { userId: user.id, type: "LISTING_VIEW", listingId: { not: null } }, select: { listingId: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const seenIds = new Set([...favs.map((f) => f.listingId), ...recent.map((r) => r.listingId!)]);
  const weights = new Map<string, number>();
  for (const i of interests) weights.set(i.categoryId, (weights.get(i.categoryId) ?? 0) + i.weight);
  // Interests on subcategories count towards their parent too.
  const cats = await db.category.findMany({ where: { id: { in: [...weights.keys()] } }, select: { id: true, parentId: true } });
  for (const c of cats) if (c.parentId) weights.set(c.parentId, (weights.get(c.parentId) ?? 0) + (weights.get(c.id) ?? 0) * 0.5);
  const topCats = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const rails: PersonalRail[] = [];

  if (topCats.length) {
    const inInterest = { categories: { some: { OR: [{ categoryId: { in: topCats } }, { category: { parentId: { in: topCats } } }] } } };
    const [exploit, explore] = await Promise.all([
      listCards(ctx, { where: { ...inInterest, id: { notIn: [...seenIds] } }, orderBy: [{ popularityScore: "desc" }, { ratingAverage: "desc" }, { publishedAt: "desc" }], take: 24 }),
      listCards(ctx, { where: { NOT: inInterest, id: { notIn: [...seenIds] } }, orderBy: [{ popularityScore: "desc" }, { publishedAt: "desc" }], take: 8 }),
    ]);
    const rec = diversify(exploit, explore, 12);
    if (rec.length) rails.push({ key: "recommended", title: "Recommended for you", items: rec });
    const popular = await listCards(ctx, { where: { ...inInterest, popularityScore: { gt: 0 } }, orderBy: [{ popularityScore: "desc" }], take: 12 });
    if (popular.length) rails.push({ key: "popular-interests", title: "Popular in your interests", items: popular });
  }

  const lastViewed = recent[0]?.listingId;
  if (lastViewed) {
    const l = await db.listing.findFirst({ where: { AND: [publicListingWhere(ctx), { id: lastViewed }] }, select: { id: true, name: true } });
    if (l) {
      const ids = (await relatedCandidateIds(l.id, 20)).map((c) => c.id).filter((id) => !seenIds.has(id));
      const items = (await cardsByIds(ctx, ids)).slice(0, 12);
      if (items.length) rails.push({ key: "because-viewed", title: "You might like these", items });
    }
  }
  if (favs.length) {
    const scores = new Map<string, number>();
    for (const f of favs.slice(0, 5)) for (const c of await relatedCandidateIds(f.listingId, 20)) if (!seenIds.has(c.id)) scores.set(c.id, (scores.get(c.id) ?? 0) + c.score);
    const items = (await cardsByIds(ctx, [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id))).slice(0, 12);
    if (items.length) rails.push({ key: "similar-favorites", title: "Based on your saved apps", items });
  }
  const recentIds = [...new Set(recent.map((r) => r.listingId!))].slice(0, 12);
  const recentCards = await cardsByIds(ctx, recentIds);
  if (recentCards.length) rails.push({ key: "recently-explored", title: "Recently explored", items: recentCards });
  const discover = await listCards(ctx, { where: { id: { notIn: [...seenIds] }, ...(topCats.length ? { NOT: { categories: { some: { OR: [{ categoryId: { in: topCats } }, { category: { parentId: { in: topCats } } }] } } } } : {}) }, orderBy: [{ publishedAt: "desc" }], take: 12 });
  if (discover.length) rails.push({ key: "discover", title: "Discover more apps", items: discover });
  return dedupeRails(rails);
}

/** An app appears in at most one personal rail; rails left with fewer than 3 apps are dropped. */
export function dedupeRails(rails: PersonalRail[]): PersonalRail[] {
  const shown = new Set<string>();
  const out: PersonalRail[] = [];
  for (const r of rails) {
    const items = r.items.filter((i) => !shown.has(i.id));
    if (items.length < 3) continue;
    items.forEach((i) => shown.add(i.id));
    out.push({ ...r, items });
  }
  return out;
}
