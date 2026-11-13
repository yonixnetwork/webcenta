import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import { PLATFORM_LABEL, PRICING_LABEL } from "@/lib/labels";
import { PLATFORMS, PRICING, type SearchFilters } from "@/lib/search-params";
import { buttonClass } from "./ui/button";
import { CloseFilters, FilterPanel, SortSelect } from "./filter-panel";

const FLAGS = [
  ["openSource", "Open source"],
  ["browserBased", "Browser-based"],
  ["mobileFriendly", "Mobile-friendly"],
  ["pwa", "Installable PWA"],
  ["verified", "Verified developer"],
  ["recentlyUpdated", "Recently updated"],
  ["highlyRated", "Highly rated"],
] as const;

const SORT_LABEL = { relevance: "Best match", newest: "Newest", updated: "Recently updated", rating: "Highest rated", name: "Name (A–Z)" } as const;

/**
 * Compact filters: one slim bar (result count, sort, "Filters" with the number active). The
 * filters open as a bottom sheet on phones and as a panel under the bar on larger screens,
 * with Reset and Apply. A plain GET form: works without JavaScript and gives shareable URLs.
 */
export function FilterBar({ basePath, filters, total, hideCategory = false, categories = [] }: {
  basePath: string; filters: SearchFilters; total: number; hideCategory?: boolean; categories?: Array<{ slug: string; name: string }>;
}) {
  const active = filters.pricing.length + FLAGS.filter(([k]) => filters[k]).length + (filters.platform ? 1 : 0) + (filters.country ? 1 : 0) + (!hideCategory && filters.category ? 1 : 0);
  const sorts = (filters.q ? ["relevance", "newest", "updated", "rating", "name"] : ["newest", "updated", "rating", "name"]) as Array<keyof typeof SORT_LABEL>;
  const selectClass = "h-9 max-w-full rounded-xl border border-border bg-surface px-2.5 text-sm outline-none focus:border-brand";
  const reset = basePath + (filters.q ? `?q=${encodeURIComponent(filters.q)}` : "");

  return (
    <form action={basePath} method="get" className="relative flex flex-wrap items-center gap-2">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      <p className="mr-auto text-sm text-muted" aria-live="polite"><span className="font-semibold text-text">{total}</span> {total === 1 ? "result" : "results"}</p>
      <label className="text-sm">
        <span className="sr-only">Sort by</span>
        <SortSelect name="sort" defaultValue={filters.sort ?? sorts[0]} className={selectClass}>
          {sorts.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
        </SortSelect>
      </label>
      <FilterPanel>
        <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold hover:border-brand [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4" aria-hidden />Filters
          {active > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-contrast" aria-label={`${active} active`}>{active}</span>}
        </summary>
        {/* Phones: dimmed backdrop + bottom sheet. Larger screens: a panel below the bar. */}
        <CloseFilters label="Close filters" className="fixed inset-0 z-[55] bg-black/40 sm:hidden" />
        <div data-filter-panel role="group" aria-label="Filters"
          className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[85dvh] flex-col rounded-t-3xl border border-border bg-surface shadow-pop sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-11 sm:max-h-[70vh] sm:w-[min(36rem,calc(100vw-3rem))] sm:rounded-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-semibold">Filters</p>
            <CloseFilters label="Close" className="grid size-8 place-items-center rounded-full hover:bg-surface-2"><X className="size-4" aria-hidden /></CloseFilters>
          </div>
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 py-4 sm:grid-cols-2">
            {!hideCategory && categories.length > 0 && (
              <label className="block text-sm sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Category</span>
                <select name="category" defaultValue={filters.category ?? ""} className={`${selectClass} mt-1 w-full`}>
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </label>
            )}
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Pricing</legend>
              {PRICING.map((p) => (
                <label key={p} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" name="pricing" value={p} defaultChecked={filters.pricing.includes(p)} className="size-4 accent-[var(--brand)]" />
                  {PRICING_LABEL[p]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Features</legend>
              {FLAGS.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" name={k} value="1" defaultChecked={filters[k]} className="size-4 accent-[var(--brand)]" /> {label}
                </label>
              ))}
            </fieldset>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Platform</span>
              <select name="platform" defaultValue={filters.platform ?? ""} className={`${selectClass} mt-1 w-full`}>
                <option value="">Any platform</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Supported country (ISO code)</span>
              <input name="country" defaultValue={filters.country ?? ""} maxLength={2} pattern="[A-Za-z]{2}" placeholder="e.g. GB" className={`${selectClass} mt-1 w-full uppercase`} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Link href={reset} className="text-sm font-semibold text-brand hover:underline">Reset{active > 0 ? ` (${active})` : ""}</Link>
            <button type="submit" className={buttonClass("primary", "md")}>Apply</button>
          </div>
        </div>
      </FilterPanel>
      {/* Sorting alone applies with this button (no JavaScript needed); hidden from people using the panel. */}
      <noscript><button type="submit" className={buttonClass("secondary", "sm")}>Sort</button></noscript>
    </form>
  );
}
