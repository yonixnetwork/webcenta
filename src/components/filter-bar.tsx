import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { PLATFORM_LABEL, PRICING_LABEL } from "@/lib/labels";
import { PLATFORMS, PRICING, type SearchFilters } from "@/lib/search-params";
import { buttonClass } from "./ui/button";

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

/** Server-rendered GET form: filters work without JavaScript and produce shareable URLs. */
export function FilterBar({ basePath, filters, total, hideCategory = false, categories = [] }: {
  basePath: string; filters: SearchFilters; total: number; hideCategory?: boolean; categories?: Array<{ slug: string; name: string }>;
}) {
  const active = filters.pricing.length + FLAGS.filter(([k]) => filters[k]).length + (filters.platform ? 1 : 0) + (!hideCategory && filters.category ? 1 : 0);
  const sorts = (filters.q ? ["relevance", "newest", "updated", "rating", "name"] : ["newest", "updated", "rating", "name"]) as Array<keyof typeof SORT_LABEL>;
  const selectClass = "h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-brand";

  return (
    <form action={basePath} method="get" className="rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4">
      {filters.q && <input type="hidden" name="q" value={filters.q} />}
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-muted" aria-live="polite"><span className="font-semibold text-text">{total}</span> {total === 1 ? "result" : "results"}</p>
        {!hideCategory && categories.length > 0 && (
          <label className="text-sm">
            <span className="sr-only">Category</span>
            <select name="category" defaultValue={filters.category ?? ""} className={selectClass}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="sr-only">Sort by</span>
          <select name="sort" defaultValue={filters.sort ?? sorts[0]} className={selectClass}>
            {sorts.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
        </label>
        <button type="submit" className={buttonClass("primary", "md")}>Apply</button>
      </div>
      <details className="group mt-3" open={active > 0}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted hover:text-text">
          <SlidersHorizontal className="size-4" aria-hidden /> Filters {active > 0 && <span className="rounded-full bg-brand-soft px-2 text-xs text-brand">{active}</span>}
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Pricing</legend>
            {PRICING.map((p) => (
              <label key={p} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" name="pricing" value={p} defaultChecked={filters.pricing.includes(p)} className="size-4 accent-[var(--brand)]" />
                {PRICING_LABEL[p]}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Features</legend>
            {FLAGS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 py-1 text-sm">
                <input type="checkbox" name={k} value="1" defaultChecked={filters[k]} className="size-4 accent-[var(--brand)]" /> {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Platform & region</legend>
            <label className="block text-sm">
              <span className="text-muted">Platform</span>
              <select name="platform" defaultValue={filters.platform ?? ""} className={`${selectClass} mt-1 w-full`}>
                <option value="">Any platform</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Supported country (ISO code)</span>
              <input name="country" defaultValue={filters.country ?? ""} maxLength={2} pattern="[A-Za-z]{2}" placeholder="e.g. GB"
                className={`${selectClass} mt-1 w-full uppercase`} />
            </label>
            {active > 0 && <Link href={basePath + (filters.q ? `?q=${encodeURIComponent(filters.q)}` : "")} className="inline-block text-sm font-semibold text-brand hover:underline">Clear filters</Link>}
          </fieldset>
        </div>
      </details>
    </form>
  );
}
