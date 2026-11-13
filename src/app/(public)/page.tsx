import Link from "next/link";
import { ChartNoAxesColumn, LayoutGrid, ShieldCheck, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { AppCard } from "@/components/app-card";
import { FeaturedCarousel, StoreListSection } from "@/components/store-sections";
import { SearchBox } from "@/components/search-box";
import { EmptyState } from "@/components/states";
import { getCategoryTree } from "@/server/catalog/categories";
import { getHomepage } from "@/server/catalog/homepage";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";
import { personalRails } from "@/server/personalization/recommend";
import { siteInfo } from "@/server/settings/site";

export default async function HomePage() {
  const ctx = await getViewerContext();
  const user = await getCurrentUser();
  const [{ rails, collections }, tree, personal] = await Promise.all([getHomepage(ctx), getCategoryTree(ctx.maxAgeRating), user ? personalRails(user, ctx) : Promise.resolve([])]);
  const suggested = tree.slice(0, 6).map((c) => c.name);
  const site = await siteInfo();
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const orgLd = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: origin, logo: `${origin}/icons/icon-512.png`, ...(site.socialLinks.length ? { sameAs: site.socialLinks.map((l) => l.url) } : {}) };

  // The first rail with items becomes the swipeable featured carousel at the top (as in the app stores).
  const featured = rails.find((r) => r.key === "featured" && r.items.length) ?? rails.find((r) => r.key === "editors-picks" && r.items.length);
  const ranked = new Set(["popular", "trending", "top-rated"]);
  const chip = "inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold shadow-card transition hover:border-brand/40 hover:text-brand";

  return (
    <div className="space-y-7 sm:space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />

      {/* Phones: a large title and categories first, like the App Store and Google Play. The search tab lives in the bottom bar. */}
      <h1 className="-mb-4 text-[2rem] font-extrabold leading-tight tracking-tight sm:hidden">Discover</h1>
      <nav aria-label="Browse" className="scrollbar-none -mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 py-1 sm:hidden">
        <Link href="/search?sort=popular" className={chip}><ChartNoAxesColumn className="size-4 text-brand" aria-hidden />Top charts</Link>
        <Link href="/categories" className={chip}><LayoutGrid className="size-4 text-brand" aria-hidden />Categories</Link>
        {tree.slice(0, 14).map((c) => (
          <Link key={c.id} href={`/c/${c.slug}`} className={chip}><CategoryIcon icon={c.icon} className="size-4 text-brand" />{c.name}</Link>
        ))}
      </nav>

      {/* Larger screens: a compact introduction with search. */}
      <section className="hero-glow hidden rounded-[2rem] border border-border px-8 pb-10 pt-12 sm:block">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-brand" aria-hidden /> The discovery store for the open web
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            Find the right web app for <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">anything</span>
          </h1>
          <div className="mx-auto mt-8 max-w-2xl text-left"><SearchBox size="lg" suggested={suggested} /></div>
          <p className="mt-4 text-balance text-xs text-subtle">
            <ShieldCheck className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Every listing is checked for security, and you see a notice before leaving Webcenta.
          </p>
        </div>
      </section>

      {featured && <FeaturedCarousel label={featured.key === "featured" ? "Featured" : "Editor’s pick"} items={featured.items} sponsoredIds={featured.sponsoredIds} />}

      {personal.length > 0 && (
        <div className="space-y-8">
          {personal.map((r) => <StoreListSection key={r.key} title={r.title} items={r.items} />)}
          <p className="-mt-4 text-xs text-subtle">Personalised from your activity on Webcenta. <Link href="/account/privacy" className="underline">Manage personalisation</Link></p>
        </div>
      )}

      {rails.length === 0 && collections.length === 0 ? (
        <EmptyState title="The catalogue is being prepared">
          Listings appear here once they have been reviewed and published. Check back soon.
        </EmptyState>
      ) : (
        rails.filter((r) => r !== featured).map((r) => <StoreListSection key={r.key} title={r.title} subtitle={r.subtitle} href={r.href} items={r.items} sponsoredIds={r.sponsoredIds} ranked={ranked.has(r.key)} />)
      )}

      <section aria-labelledby="browse-categories" className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 id="browse-categories" className="text-[1.35rem] font-bold tracking-tight sm:text-2xl">Browse categories</h2>
          <Link href="/categories" className="text-sm font-semibold text-brand hover:underline">See all</Link>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tree.slice(0, 12).map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-semibold shadow-card transition hover:border-brand/40 hover:text-brand">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-soft"><CategoryIcon icon={c.icon} className="size-4 text-brand" /></span>
                <span className="truncate">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {collections.length > 0 && (
        <section aria-labelledby="collections" className="space-y-5">
          <h2 id="collections" className="text-xl font-bold tracking-tight sm:text-2xl">Curated collections</h2>
          <div className="grid gap-5 lg:grid-cols-2">
            {collections.map((c) => (
              <div key={c.slug} className="rounded-3xl border border-border bg-gradient-to-br from-brand-soft to-surface p-5 shadow-card">
                <h3 className="text-lg font-bold"><Link href={`/collections/${c.slug}`} className="hover:text-brand">{c.title} →</Link></h3>
                {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                <ul className="mt-4 grid grid-cols-2 gap-3">
                  {c.items.slice(0, 4).map((a) => <li key={a.id}><AppCard app={a} compact /></li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
