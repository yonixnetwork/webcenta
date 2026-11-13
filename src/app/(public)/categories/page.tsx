import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { categoryListingCounts, getCategoryTree } from "@/server/catalog/categories";
import { getViewerContext } from "@/server/viewer";

export const metadata: Metadata = {
  title: "All categories",
  description: "Browse web apps and online services by category.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const ctx = await getViewerContext();
  const [tree, counts] = await Promise.all([getCategoryTree(ctx.maxAgeRating), categoryListingCounts(ctx)]);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">All categories</h1>
        <p className="mt-2 text-muted">{tree.length} categories. Some regulated categories are only shown once legal review is complete.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <Link href={`/c/${c.slug}`} className="group flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><CategoryIcon icon={c.icon} emoji={c.emoji} preferEmoji className="grid size-5 place-items-center text-xl" /></span>
              <span className="min-w-0">
                <span className="block truncate font-semibold group-hover:text-brand">{c.name}</span>
                <span className="text-xs text-subtle">{counts.get(c.id) ?? 0} listed</span>
              </span>
            </Link>
            {c.children.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {c.children.map((s) => (
                  <li key={s.id}>
                    <Link href={`/c/${s.slug}`} className="inline-block rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-brand">{s.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
