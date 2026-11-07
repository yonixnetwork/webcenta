import Link from "next/link";
import { filtersToQuery, type SearchFilters } from "@/lib/search-params";
import { cn } from "./ui/cn";

export function Pagination({ basePath, filters, page, pageCount, omitCategory = false }: {
  basePath: string; filters: SearchFilters; page: number; pageCount: number; omitCategory?: boolean;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => basePath + filtersToQuery({ ...filters, category: omitCategory ? undefined : filters.category, page: p });
  const link = "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-medium hover:bg-surface-2";
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2 pt-4">
      {page > 1 && <Link href={href(page - 1)} rel="prev" className={link}>Previous</Link>}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-2">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="text-subtle">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} className={cn(link, p === page && "border-brand bg-brand-soft text-brand")}>{p}</Link>
        </span>
      ))}
      {page < pageCount && <Link href={href(page + 1)} rel="next" className={link}>Next</Link>}
    </nav>
  );
}
