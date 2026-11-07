import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import { cardsByIds, listCards, MIN_RATINGS_FOR_DISPLAY, type ListingCard } from "./listings";

export interface HomeRail {
  key: string;
  title: string;
  subtitle?: string;
  href?: string;
  items: ListingCard[];
  /** Placement ids of sponsored items — rendered with a visible "Sponsored" label. */
  sponsoredIds: string[];
}

export interface HomeCollection {
  slug: string;
  title: string;
  description: string | null;
  items: ListingCard[];
}

/**
 * Builds homepage rails from admin-configurable HomepageSection rows. A rail is
 * omitted when it has no real data (e.g. "Top rated" before any ratings exist) —
 * we never fill sections with fabricated items or numbers.
 */
export async function getHomepage(ctx: ViewerContext): Promise<{ rails: HomeRail[]; collections: HomeCollection[] }> {
  const sections = await db.homepageSection.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } });
  const rails: HomeRail[] = [];
  const collections: HomeCollection[] = [];
  const now = new Date();

  for (const s of sections) {
    const cfg = (s.config ?? {}) as { limit?: number; categorySlugs?: string[]; collectionSlugs?: string[] };
    const take = Math.min(cfg.limit ?? 12, 24);
    switch (s.type) {
      case "FEATURED": {
        const placements = await db.featuredPlacement.findMany({
          where: { slot: "HOME_FEATURED", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          orderBy: { sortOrder: "asc" },
          take,
          select: { listingId: true, isSponsored: true },
        });
        const items = await cardsByIds(ctx, placements.map((p) => p.listingId));
        rails.push({ key: s.key, title: s.title, items, sponsoredIds: placements.filter((p) => p.isSponsored).map((p) => p.listingId) });
        break;
      }
      case "EDITORS_PICKS":
        rails.push({ key: s.key, title: s.title, subtitle: "Chosen by the WebCenter editorial team", sponsoredIds: [],
          items: await listCards(ctx, { where: { isEditorsPick: true }, orderBy: [{ publishedAt: "desc" }], take }) });
        break;
      case "NEW":
        rails.push({ key: s.key, title: s.title, href: "/search?sort=newest", sponsoredIds: [],
          items: await listCards(ctx, { orderBy: [{ publishedAt: "desc" }], take }) });
        break;
      case "RECENTLY_UPDATED": {
        // Only listings whose content changed after publication.
        const rows = await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Listing" WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
            AND "contentUpdatedAt" > "publishedAt" + interval '1 day'
          ORDER BY "contentUpdatedAt" DESC LIMIT ${take * 2}`;
        rails.push({ key: s.key, title: s.title, href: "/search?sort=updated", sponsoredIds: [],
          items: (await cardsByIds(ctx, rows.map((r) => r.id))).slice(0, take) });
        break;
      }
      case "TRENDING":
        rails.push({ key: s.key, title: s.title, sponsoredIds: [],
          items: await listCards(ctx, { where: { trendingScore: { gt: 0 } }, orderBy: [{ trendingScore: "desc" }], take }) });
        break;
      case "POPULAR":
        rails.push({ key: s.key, title: s.title, sponsoredIds: [],
          items: await listCards(ctx, { where: { popularityScore: { gt: 0 } }, orderBy: [{ popularityScore: "desc" }], take }) });
        break;
      case "TOP_RATED":
        rails.push({ key: s.key, title: s.title, href: "/search?sort=rating&highlyRated=1", sponsoredIds: [],
          items: await listCards(ctx, {
            where: { ratingCount: { gte: MIN_RATINGS_FOR_DISPLAY }, ratingAverage: { gte: 4 } },
            orderBy: [{ ratingAverage: "desc" }, { ratingCount: "desc" }], take }) });
        break;
      case "BY_CATEGORY": {
        for (const slug of cfg.categorySlugs ?? []) {
          const cat = await db.category.findFirst({ where: { slug, isEnabled: true, isRestricted: false }, select: { name: true } });
          if (!cat) continue;
          rails.push({ key: `${s.key}:${slug}`, title: cat.name, href: `/c/${slug}`, sponsoredIds: [],
            items: await listCards(ctx, {
              where: { categories: { some: { category: { OR: [{ slug }, { parent: { slug } }] } } } },
              orderBy: [{ isEditorsPick: "desc" }, { publishedAt: "desc" }], take }) });
        }
        break;
      }
      case "COLLECTION": {
        const cols = await db.collection.findMany({
          where: { isEditorial: true, visibility: "PUBLIC", ...(cfg.collectionSlugs?.length ? { slug: { in: cfg.collectionSlugs } } : {}) },
          orderBy: { updatedAt: "desc" },
          take: 6,
          include: { items: { orderBy: { sortOrder: "asc" }, take: 8, select: { listingId: true } } },
        });
        for (const c of cols) {
          const items = await cardsByIds(ctx, c.items.map((i) => i.listingId));
          if (items.length) collections.push({ slug: c.slug, title: c.title, description: c.description, items });
        }
        break;
      }
      // RECOMMENDED needs personalisation (Phase 5); ALTERNATIVES_SPOTLIGHT is rendered on detail pages.
      default:
        break;
    }
  }
  return { rails: rails.filter((r) => r.items.length > 0), collections };
}

export async function getPublicCollection(ctx: ViewerContext, slug: string) {
  // Editorial collections and users' collections that were shared (public or unlisted).
  const c = await db.collection.findFirst({
    where: { slug, visibility: { in: ["PUBLIC", "UNLISTED"] }, OR: [{ isEditorial: true }, { owner: { status: "ACTIVE" } }] },
    include: { items: { orderBy: { sortOrder: "asc" }, select: { listingId: true, note: true } }, owner: { select: { name: true } } },
  });
  if (!c) return null;
  const items = await cardsByIds(ctx, c.items.map((i) => i.listingId));
  return { ...c, cards: items };
}
