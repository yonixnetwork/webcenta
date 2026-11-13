import { db } from "@/server/db";
import type { CategoryNode } from "./categories";

/** Full category tree including disabled/restricted categories (admin use only). */
export async function getAllCategoriesTree(): Promise<CategoryNode[]> {
  const rows = await db.category.findMany({ where: { mergedIntoId: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, icon: true, emoji: true, description: true, parentId: true, isEnabled: true, isRestricted: true, defaultAgeRating: true } });
  const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { id: r.id, slug: r.slug, icon: r.icon, emoji: r.emoji, description: r.description, defaultAgeRating: r.defaultAgeRating, name: `${r.name}${!r.isEnabled ? " (disabled)" : r.isRestricted ? " (restricted)" : ""}`, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const r of rows) (r.parentId ? nodes.get(r.parentId)?.children : roots)?.push(nodes.get(r.id)!);
  return roots;
}
