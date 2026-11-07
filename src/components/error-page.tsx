import { House, Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { CategoryIcon } from "@/components/category-icon";
import { buttonClass } from "@/components/ui/button";
import { POPULAR_CATEGORIES } from "@/lib/popular-categories";

/**
 * Shared layout for 404 / 403 / 500 / 503 pages. Works in server and client
 * components and needs no database, so it renders even when the backend fails.
 * Plain <a> links are used on purpose: after an error a full navigation is the
 * most reliable way to recover.
 */
export function ErrorPage({
  code,
  title,
  icon,
  children,
  actions,
  showSearch = true,
  showCategories = true,
  standalone = false,
  homeLabel = "Go to the homepage",
}: {
  code: string;
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  showSearch?: boolean;
  showCategories?: boolean;
  /** Render with its own brand header (used outside the public layout). */
  standalone?: boolean;
  homeLabel?: string;
}) {
  return (
    <div className={standalone ? "mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-8 sm:px-6" : "mx-auto max-w-2xl py-6 sm:py-10"} data-error-code={code}>
      {standalone && (
        <header className="mb-10">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full navigation after an error */}
          <a href="/" aria-label="Webcenta home" className="inline-flex"><Logo /></a>
        </header>
      )}
      <section aria-labelledby="error-title" className="text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-brand">Error {code}</p>
        <h1 id="error-title" className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {children && <div className="mx-auto mt-3 max-w-lg space-y-2 text-muted">{children}</div>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actions}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full navigation after an error */}
          <a href="/" className={buttonClass(actions ? "secondary" : "primary", "md")}><House className="size-4" aria-hidden /> {homeLabel}</a>
        </div>
      </section>

      {showSearch && (
        <form action="/search" method="get" role="search" className="mx-auto mt-10 flex w-full max-w-lg gap-2">
          <label htmlFor="error-search" className="sr-only">Search Webcenta</label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input id="error-search" name="q" type="search" maxLength={120} placeholder="Search apps, tools and websites"
              className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30" />
          </div>
          <button type="submit" className={buttonClass("primary", "md")}>Search</button>
        </form>
      )}

      {showCategories && (
        <nav aria-labelledby="popular-cats" className="mt-10">
          <h2 id="popular-cats" className="text-center text-sm font-semibold text-muted">Popular categories</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {POPULAR_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <a href={`/c/${c.slug}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium shadow-card transition hover:border-brand/40 hover:text-brand">
                  <CategoryIcon icon={c.icon} className="size-4 text-brand" /> {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
