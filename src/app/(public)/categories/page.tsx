import { categoryNamer } from "@/server/i18n/categories";
import { getT } from "@/i18n/server";
import { seoAlternates } from "@/server/i18n/seo";
import type { Metadata } from "next";
import Link from "@/i18n/client";
import { CategoryIcon } from "@/components/category-icon";
import { categoryListingCounts, getCategoryTree } from "@/server/catalog/categories";
import { getViewerContext } from "@/server/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("store");
  return { title: t("meta.categoriesTitle"), description: t("meta.categoriesDescription"), ...(await seoAlternates("/categories")) };
}

export default async function CategoriesPage() {
  const ctx = await getViewerContext();
  const [tree, counts, t, catName] = await Promise.all([getCategoryTree(ctx.maxAgeRating), categoryListingCounts(ctx), getT("store"), categoryNamer()]);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{t("meta.categoriesTitle")}</h1>
        <p className="mt-2 text-muted">{t("categories.intro", { count: tree.length })}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <Link href={`/c/${c.slug}`} className="group flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><CategoryIcon icon={c.icon} emoji={c.emoji} preferEmoji className="grid size-5 place-items-center text-xl" /></span>
              <span className="min-w-0">
                <span className="block truncate font-semibold group-hover:text-brand">{catName(c)}</span>
                <span className="text-xs text-subtle">{t("categories.listed", { count: counts.get(c.id) ?? 0 })}</span>
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
