import Link from "next/link";
import { BadgeCheck, ChevronRight } from "lucide-react";
import type { ListingCard } from "@/server/catalog/listings";
import { mediaUrl } from "@/server/storage";
import { AppIcon } from "./app-icon";
import { cn } from "./ui/cn";

const logoOf = (app: ListingCard) => app.media.find((m) => m.kind === "LOGO")?.asset.storageKey;
const shotOf = (app: ListingCard) => app.media.find((m) => m.kind === "SCREENSHOT" || m.kind === "PREVIEW")?.asset.storageKey;

function SectionHeader({ id, title, subtitle, href }: { id: string; title: string; subtitle?: string; href?: string }) {
  const heading = <h2 id={id} className="inline-flex items-center gap-1 text-[1.35rem] font-bold tracking-tight sm:text-2xl">{title}{href && <ChevronRight className="size-5 text-subtle" aria-hidden />}</h2>;
  return (
    <div className="mb-3">
      {href ? <Link href={href} className="hover:text-brand">{heading}</Link> : heading}
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

/** One App Store-style row: icon, name, one line of text, and a pill button. */
export function AppRow({ app, rank, sponsored }: { app: ListingCard; rank?: number; sponsored?: boolean }) {
  const verified = app.developer && app.developer.verificationLevel !== "UNVERIFIED";
  return (
    <div className="flex items-center gap-3 py-2.5">
      {rank !== undefined && <span className="w-5 shrink-0 text-center text-base font-bold text-subtle">{rank}</span>}
      <Link href={`/app/${app.slug}`} className="shrink-0" tabIndex={-1} aria-hidden><AppIcon name={app.name} storageKey={logoOf(app)} size="md" /></Link>
      <div className="min-w-0 flex-1 border-b border-border/70 pb-2.5 group-last:border-0">
        <Link href={`/app/${app.slug}`} className="block truncate font-semibold hover:text-brand">{app.name}</Link>
        <p className="truncate text-[13px] text-muted">{app.tagline ?? app.primaryCategory?.name ?? app.publisherName}</p>
        <p className="flex items-center gap-1 truncate text-xs text-subtle">
          {sponsored && <span className="font-semibold text-warning">Sponsored ·</span>}
          {app.primaryCategory?.name}
          {verified && <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Verified developer" />}
          {app.ratingCount > 0 && <span>· ★ {app.ratingAverage.toFixed(1)}</span>}
        </p>
      </div>
      <Link href={`/app/${app.slug}`} aria-label={`View ${app.name}`} className="shrink-0 rounded-full bg-surface-2 px-4 py-1.5 text-sm font-bold text-brand hover:bg-brand-soft">View</Link>
    </div>
  );
}

/** "Apps in Heavy Rotation": columns of three rows that page horizontally on phones. */
export function StoreListSection({ title, subtitle, href, items, sponsoredIds = [], ranked = false }: { title: string; subtitle?: string; href?: string; items: ListingCard[]; sponsoredIds?: string[]; ranked?: boolean }) {
  if (!items.length) return null;
  const id = `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const columns: ListingCard[][] = [];
  for (let i = 0; i < Math.min(items.length, 12); i += 3) columns.push(items.slice(i, i + 3));
  return (
    <section aria-labelledby={id}>
      <SectionHeader id={id} title={title} subtitle={subtitle} href={href} />
      <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-8 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {columns.map((col, ci) => (
          <ul key={ci} className="w-[88%] shrink-0 snap-start sm:w-auto">
            {col.map((app, ri) => <li key={app.id} className="group"><AppRow app={app} rank={ranked ? ci * 3 + ri + 1 : undefined} sponsored={sponsoredIds.includes(app.id)} /></li>)}
          </ul>
        ))}
      </div>
    </section>
  );
}

const GRADIENTS = ["from-indigo-600 via-violet-600 to-fuchsia-500", "from-sky-600 via-cyan-500 to-emerald-400", "from-rose-600 via-orange-500 to-amber-400", "from-slate-800 via-slate-700 to-indigo-600", "from-emerald-600 via-teal-500 to-sky-500"];

/** Large featured cards (App Store "Now available" / Google Play banner), swipeable on phones. */
export function FeaturedCarousel({ label, items, sponsoredIds = [] }: { label: string; items: ListingCard[]; sponsoredIds?: string[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="featured-carousel">
      <h2 id="featured-carousel" className="sr-only">{label}</h2>
      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {items.slice(0, 8).map((app, i) => {
          const shot = shotOf(app);
          return (
            <li key={app.id} className="w-[90%] shrink-0 snap-center sm:w-auto">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand">{sponsoredIds.includes(app.id) ? "Sponsored" : label}</p>
              <p className="truncate text-lg font-bold tracking-tight">{app.name}</p>
              <p className="mb-2 truncate text-base text-muted">{app.tagline ?? app.primaryCategory?.name}</p>
              <Link href={`/app/${app.slug}`} className={cn("relative block aspect-[16/10] overflow-hidden rounded-3xl bg-gradient-to-br shadow-pop", GRADIENTS[i % GRADIENTS.length])}>
                {shot && (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded media served from /media
                  <img src={mediaUrl(shot)} alt="" loading={i ? "lazy" : "eager"} className="absolute inset-0 size-full object-cover object-top" />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-4 pt-10 text-white">
                  <AppIcon name={app.name} storageKey={logoOf(app)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{app.name}</p>
                    <p className="truncate text-xs text-white/80">{app.primaryCategory?.name ?? app.publisherName}</p>
                  </div>
                  <span className="rounded-full bg-white/25 px-4 py-1.5 text-sm font-bold backdrop-blur">View</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
