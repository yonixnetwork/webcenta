import { getT } from "@/i18n/server";
import Link from "@/i18n/client";
import { BadgeCheck, Star } from "lucide-react";
import { PRICING_LABEL } from "@/lib/labels";
import { visitMilestone } from "@/lib/visits";
import type { ListingCard } from "@/server/catalog/listings";
import { mediaUrl } from "@/server/storage";
import { AppIcon } from "./app-icon";
import { cn } from "./ui/cn";

const logoOf = (app: ListingCard) => app.media.find((m) => m.kind === "LOGO")?.asset.storageKey;
const shotOf = (app: ListingCard) => app.media.find((m) => m.kind === "SCREENSHOT" || m.kind === "PREVIEW")?.asset.storageKey;

async function SectionHeader({ id, title, subtitle, href }: { id: string; title: string; subtitle?: string; href?: string }) {
  const seeAll = (await getT("common"))("action.seeAll");
  const heading = <h2 id={id} className="inline-flex items-center gap-1 text-[1.35rem] font-bold tracking-tight sm:text-2xl">{title}</h2>;
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-3">
        {heading}
        {href && <Link href={href} className="shrink-0 text-sm font-semibold text-brand hover:underline">{seeAll}<span className="sr-only"> {title}</span></Link>}
      </div>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

/**
 * One line of real facts about an app: category, verified developer, rating, pricing and visit
 * milestone. Each part appears only when the data exists (nothing is estimated).
 */
export function AppMeta({ app, sponsored, verified, className }: { app: ListingCard; sponsored?: boolean; verified: boolean; className?: string }) {
  const visits = visitMilestone(app.visitCount);
  const parts: React.ReactNode[] = [];
  if (sponsored) parts.push(<span key="s" className="font-semibold text-warning">Sponsored</span>);
  if (app.primaryCategory) parts.push(<span key="c" className="truncate">{app.primaryCategory.name}</span>);
  if (app.ratingCount > 0) parts.push(<span key="r" className="inline-flex shrink-0 items-center gap-0.5"><Star className="size-3 fill-current text-amber-500" aria-hidden /><span className="sr-only">Rated </span>{app.ratingAverage.toFixed(1)}</span>);
  if (app.pricingModel !== "UNKNOWN") parts.push(<span key="p" className="shrink-0">{PRICING_LABEL[app.pricingModel]}</span>);
  if (visits) parts.push(<span key="v" className="shrink-0">{visits}</span>);
  return (
    <span className={cn("flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap", className)}>
      {parts.map((p, i) => <span key={i} className="flex min-w-0 items-center gap-1">{i > 0 && <span aria-hidden>·</span>}{p}{i === 0 && verified && <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Verified developer" />}</span>)}
    </span>
  );
}

/** One App Store-style row: the whole row (icon, name and facts) is a single link to the app's page. */
export function AppRow({ app, rank, sponsored }: { app: ListingCard; rank?: number; sponsored?: boolean }) {
  const verified = app.developer && app.developer.verificationLevel !== "UNVERIFIED";
  return (
    <Link href={`/app/${app.slug}`} className="group/row flex items-center gap-3 rounded-xl py-2.5 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      {rank !== undefined && <span className="w-5 shrink-0 text-center text-base font-bold text-subtle" aria-hidden>{rank}</span>}
      <span className="shrink-0"><AppIcon name={app.name} storageKey={logoOf(app)} size="md" /></span>
      <span className="block min-w-0 flex-1 border-b border-border/70 pb-2.5 group-last:border-0">
        <span className="block truncate font-semibold group-hover/row:text-brand">{app.name}</span>
        <span className="block truncate text-[13px] text-muted">{app.tagline ?? app.primaryCategory?.name ?? app.publisherName}</span>
        <AppMeta app={app} sponsored={sponsored} verified={Boolean(verified)} className="text-xs text-subtle" />
      </span>
    </Link>
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
                    <AppMeta app={app} verified={Boolean(app.developer && app.developer.verificationLevel !== "UNVERIFIED")} className="text-xs text-white/85 [&_svg]:text-white" />
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
