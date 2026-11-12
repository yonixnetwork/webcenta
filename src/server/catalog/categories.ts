import { db } from "@/server/db";
import type { ViewerContext } from "@/server/viewer";
import type { AgeRating } from "@/generated/prisma/enums";
import { AGE_ORDER, publicCategoryWhere, publicListingWhere } from "./visibility";

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  emoji: string | null;
  description: string | null;
  defaultAgeRating: AgeRating;
  children: CategoryNode[];
}

/** Drops categories meant for an older audience than the viewer may see (e.g. 18+ for minors and visitors). */
export function treeForAge(tree: CategoryNode[], max: AgeRating): CategoryNode[] {
  const ok = (n: CategoryNode) => AGE_ORDER.indexOf(n.defaultAgeRating) <= AGE_ORDER.indexOf(max);
  return tree.filter(ok).map((n) => ({ ...n, children: n.children.filter(ok) }));
}

// Small in-process TTL cache (no Redis on shared hosting). Category changes are
// rare; admin edits (Phase 3) will call invalidateCategoryCache().
let treeCache: { at: number; value: CategoryNode[] } | null = null;
const TREE_TTL_MS = 60_000;

export function invalidateCategoryCache() {
  treeCache = null;
}

/** The public category tree; pass the viewer's age limit to leave out categories they may not see. */
export async function getCategoryTree(maxAgeRating?: AgeRating): Promise<CategoryNode[]> {
  const tree = await fullTree();
  return maxAgeRating ? treeForAge(tree, maxAgeRating) : tree;
}

async function fullTree(): Promise<CategoryNode[]> {
  if (treeCache && Date.now() - treeCache.at < TREE_TTL_MS) return treeCache.value;
  const rows = await db.category.findMany({
    where: publicCategoryWhere(),
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, icon: true, emoji: true, description: true, parentId: true, defaultAgeRating: true },
  });
  const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const r of rows) {
    const n = nodes.get(r.id)!;
    if (r.parentId) nodes.get(r.parentId)?.children.push(n);
    else roots.push(n);
  }
  treeCache = { at: Date.now(), value: roots };
  return roots;
}

export async function getPublicCategory(slug: string) {
  return db.category.findFirst({
    where: { AND: [publicCategoryWhere(), { slug }] },
    include: {
      parent: { select: { slug: true, name: true } },
      children: { where: publicCategoryWhere(), orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } },
    },
  });
}

/** Number of visible listings per category id (including subcategories' listings for parents). */
export async function categoryListingCounts(ctx: ViewerContext): Promise<Map<string, number>> {
  const rows = await db.listingCategory.findMany({
    where: { listing: publicListingWhere(ctx) },
    select: { categoryId: true, listingId: true, category: { select: { parentId: true } } },
  });
  const sets = new Map<string, Set<string>>();
  const add = (cat: string, listing: string) => {
    if (!sets.has(cat)) sets.set(cat, new Set());
    sets.get(cat)!.add(listing);
  };
  for (const r of rows) {
    add(r.categoryId, r.listingId);
    if (r.category.parentId) add(r.category.parentId, r.listingId);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}
