import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ListingCard } from "@/server/catalog/listings";
import { AppCard } from "./app-card";

/** Horizontal scroll on small screens, grid on large screens. */
export function Rail({ title, subtitle, href, items, sponsoredIds = [] }: { title: string; subtitle?: string; href?: string; items: ListingCard[]; sponsoredIds?: string[] }) {
  const id = `rail-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand hover:underline">
            See all <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((app) => (
          <li key={app.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <AppCard app={app} sponsored={sponsoredIds.includes(app.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CardGrid({ items }: { items: ListingCard[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((app) => (
        <li key={app.id}><AppCard app={app} /></li>
      ))}
    </ul>
  );
}
