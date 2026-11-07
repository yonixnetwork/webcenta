import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { FilterBar } from "@/components/filter-bar";
import { Pagination } from "@/components/pagination";
import { CardGrid } from "@/components/rail";
import { EmptyState } from "@/components/states";
import { parseFilters } from "@/lib/search-params";
import { getPublicCategory } from "@/server/catalog/categories";
import { searchListings } from "@/server/search/search";
import { getViewerContext } from "@/server/viewer";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getPublicCategory(slug);
  if (!cat) return { title: "Category not found", robots: { index: false } };
  return {
    title: `${cat.name} — web apps and websites`,
    description: cat.seoDescription ?? cat.description ?? `Discover and compare ${cat.name.toLowerCase()} web apps on Webcenta.`,
    alternates: { canonical: `/c/${cat.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cat = await getPublicCategory(slug);
  if (!cat) notFound();
  const ctx = await getViewerContext();
  const filters = { ...parseFilters(await searchParams), category: cat.slug };
  const result = await searchListings(ctx, filters);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link href="/categories" className="hover:text-text">Categories</Link>
        {cat.parent && (<><ChevronRight className="size-4" aria-hidden /><Link href={`/c/${cat.parent.slug}`} className="hover:text-text">{cat.parent.name}</Link></>)}
      </nav>
      <header className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><CategoryIcon icon={cat.icon} className="size-7" /></span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{cat.name}</h1>
          {cat.description && <p className="mt-1 max-w-2xl text-muted">{cat.description}</p>}
        </div>
      </header>
      {cat.children.length > 0 && (
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Subcategories">
          {cat.children.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/c/${c.slug}`} className="inline-block rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:border-brand/40 hover:text-brand">{c.name}</Link>
            </li>
          ))}
        </ul>
      )}
      <FilterBar basePath={`/c/${cat.slug}`} filters={filters} total={result.total} hideCategory />
      {result.items.length === 0 ? (
        <EmptyState title="No listings here yet">
          Nothing matches these filters in {cat.name} yet. Try removing a filter, or <Link href="/search" className="text-brand underline">search everything</Link>.
        </EmptyState>
      ) : (
        <CardGrid items={result.items} />
      )}
      <Pagination basePath={`/c/${cat.slug}`} filters={filters} page={result.page} pageCount={result.pageCount} omitCategory />
    </div>
  );
}
