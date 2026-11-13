import type { Metadata } from "next";
import { after } from "next/server";
import { FilterBar } from "@/components/filter-bar";
import { Pagination } from "@/components/pagination";
import { CardGrid } from "@/components/rail";
import { SearchBox } from "@/components/search-box";
import { EmptyState } from "@/components/states";
import { parseFilters } from "@/lib/search-params";
import { getCategoryTree } from "@/server/catalog/categories";
import { recordSearchStat, searchListings } from "@/server/search/search";
import { getViewerContext } from "@/server/viewer";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  // Search result pages are not indexed (thin/duplicate content).
  return { title: f.q ? `Search: ${f.q}` : "Search", robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const ctx = await getViewerContext();
  const [result, tree] = await Promise.all([searchListings(ctx, filters), getCategoryTree(ctx.maxAgeRating)]);
  if (filters.q && filters.page === 1) {
    const q = filters.q;
    after(() => recordSearchStat(q, result.total).catch(() => undefined));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{filters.q ? <>Results for “{filters.q}”</> : "Search & browse"}</h1>
      <div className="max-w-2xl"><SearchBox defaultValue={filters.q ?? ""} suggested={tree.slice(0, 6).map((c) => c.name)} /></div>
      <FilterBar basePath="/search" filters={filters} total={result.total} categories={tree.map((c) => ({ slug: c.slug, name: c.name }))} />
      {result.items.length === 0 ? (
        <EmptyState title="No matching apps">
          Try different words, check the spelling, or remove some filters.
        </EmptyState>
      ) : (
        <CardGrid items={result.items} />
      )}
      {result.truncated && <p className="text-center text-xs text-subtle">Showing the best matches. Refine your search to see more specific results.</p>}
      <Pagination basePath="/search" filters={filters} page={result.page} pageCount={result.pageCount} />
    </div>
  );
}
