import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { StoreListSection } from "@/components/store-sections";
import { EmptyState } from "@/components/states";
import { getCategoryTree } from "@/server/catalog/categories";
import { listCards } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";

export const metadata: Metadata = {
  title: "Apps — web applications and online tools",
  description: "Browse web applications and online tools by category: AI, productivity, business, education, design, developer tools and more.",
  alternates: { canonical: "/apps" },
};

/** Applications and web tools, without games (games have their own tab). */
const NOT_GAMES = { primaryCategory: { AND: [{ slug: { not: "games" } }, { OR: [{ parentId: null }, { parent: { slug: { not: "games" } } }] }] } };
const FEATURED_CATEGORIES = ["ai", "productivity", "business", "education", "developer-tools", "art-design", "photography", "finance"];

export default async function AppsPage() {
  const ctx = await getViewerContext();
  const tree = (await getCategoryTree(ctx.maxAgeRating)).filter((c) => c.slug !== "games");
  const [popular, latest, ...byCategory] = await Promise.all([
    listCards(ctx, { where: { ...NOT_GAMES, popularityScore: { gt: 0 } }, orderBy: [{ popularityScore: "desc" }], take: 12 }),
    listCards(ctx, { where: NOT_GAMES, orderBy: [{ publishedAt: "desc" }], take: 12 }),
    ...FEATURED_CATEGORIES.map((slug) => listCards(ctx, {
      where: { categories: { some: { category: { OR: [{ slug }, { parent: { slug } }] } } } },
      orderBy: [{ isEditorsPick: "desc" }, { popularityScore: "desc" }, { publishedAt: "desc" }], take: 12,
    })),
  ]);
  const name = (slug: string) => tree.find((c) => c.slug === slug)?.name ?? slug;
  const empty = !popular.length && !latest.length && byCategory.every((r) => !r.length);
  const chip = "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold shadow-card transition hover:border-brand/40 hover:text-brand";

  return (
    <div className="space-y-8 sm:space-y-12">
      <header className="space-y-3">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">Apps</h1>
        <nav aria-label="App categories" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {tree.map((c) => <Link key={c.id} href={`/c/${c.slug}`} className={chip}><CategoryIcon icon={c.icon} className="size-4 text-brand" />{c.name}</Link>)}
        </nav>
      </header>
      {empty ? (
        <EmptyState title="No apps here yet">Apps appear once they have been reviewed and published.</EmptyState>
      ) : (
        <>
          <StoreListSection title="Popular apps" subtitle="Most viewed on Webcenta recently" items={popular} ranked />
          <StoreListSection title="New apps" href="/search?sort=newest" items={latest} />
          {FEATURED_CATEGORIES.map((slug, i) => <StoreListSection key={slug} title={name(slug)} href={`/c/${slug}`} items={byCategory[i] ?? []} />)}
        </>
      )}
    </div>
  );
}
