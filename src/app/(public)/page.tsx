import type { Metadata } from "next";
import { getLocale, getT } from "@/i18n/server";
import { seoAlternates } from "@/server/i18n/seo";
import { db } from "@/server/db";
import Link from "@/i18n/client";
import { Fragment } from "react";
import { Ad, AdBanner } from "@/components/ads/ad";
import { adPolicy, feedPositions } from "@/server/ads/manager";
import { ChartNoAxesColumn, LayoutGrid, ShieldCheck, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { AppCard } from "@/components/app-card";
import { FeaturedCarousel, StoreListSection } from "@/components/store-sections";
import { SearchBox } from "@/components/search-box";
import { EmptyState } from "@/components/states";
import { categoryListingCounts, getCategoryTree } from "@/server/catalog/categories";
import { getHomepage } from "@/server/catalog/homepage";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";
import { personalRails } from "@/server/personalization/recommend";
import { siteInfo } from "@/server/settings/site";
import { categoryNamer } from "@/server/i18n/categories";

/** Default section titles and subtitles (base data); an admin-customised title is shown as written. */
const RAIL_TITLES: Record<string, string> = { featured: "Featured", "editors-picks": "Editor's picks", trending: "Trending now", popular: "Most popular", "top-rated": "Highly rated", new: "New on Webcenta", "recently-updated": "Recently updated", collections: "Curated collections" };
const RAIL_SUBTITLES: Record<string, string> = { "Chosen by the Webcenta editorial team": "rail.editorsPicksSub", "Newly added to the marketplace": "rail.newSub", "Listings with new details": "rail.updatedSub", "Gaining the most attention on Webcenta this week": "rail.trendingSub", "Most viewed and visited on Webcenta (not personalised)": "rail.popularSub" };

/**
 * Homepage metadata per language: Admin → SEO & languages (title, description, keywords) when
 * set, otherwise the translated defaults; English falls back to Settings → Branding & SEO.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [locale, t, site] = await Promise.all([getLocale(), getT("store"), siteInfo()]);
  const custom = await db.localeSeo.findUnique({ where: { locale } }).catch(() => null);
  const keywords = Array.isArray(custom?.keywords) ? (custom.keywords as string[]) : [];
  const title = custom?.title || (locale === "en" ? site.defaultTitle : t("meta.homeTitle"));
  const description = custom?.description || (locale === "en" && site.description ? site.description : t("meta.homeDescription"));
  return { title: { absolute: title }, description, ...(keywords.length ? { keywords } : {}), openGraph: { siteName: site.name, type: "website", title, description, locale: locale.replace("-", "_"), images: [{ url: site.ogImageUrl || "/brand/og-default.png", width: 1200, height: 630, alt: site.name }] }, ...(await seoAlternates("/")) };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const ctx = await getViewerContext();
  const user = await getCurrentUser();
  const [{ rails, collections }, tree, personal, counts] = await Promise.all([getHomepage(ctx), getCategoryTree(ctx.maxAgeRating), user ? personalRails(user, ctx) : Promise.resolve([]), categoryListingCounts(ctx)]);
  // Popular categories: the ones with the most published apps (real counts), then the store order.
  const popularCats = [...tree].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, 12);
  const suggested = tree.slice(0, 6).map((c) => c.name);
  const site = await siteInfo();
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const orgLd = { "@context": "https://schema.org", "@type": "Organization", name: site.name, url: origin, logo: `${origin}/icons/icon-512.png`, ...(site.socialLinks.length ? { sameAs: site.socialLinks.map((l) => l.url) } : {}) };

  // The first rail with items becomes the swipeable featured carousel at the top (as in the app stores).
  const featured = rails.find((r) => r.key === "featured" && r.items.length) ?? rails.find((r) => r.key === "editors-picks" && r.items.length);
  const ranked = new Set(["popular", "trending", "top-rated"]);
  const chip = "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold shadow-card transition hover:border-brand/40 hover:text-brand";

  const [t, catName] = await Promise.all([getT("store"), categoryNamer()]);
  // Section titles: translated when they are the default ones; category sections use the category's name.
  const railTitle = (r: { key: string; title: string; href?: string }) =>
    RAIL_TITLES[r.key] === r.title ? t(`rail.${r.key}`) : r.key.startsWith("by-category:") ? catName({ slug: r.key.slice("by-category:".length), name: r.title }) : r.title;
  const railSub = (sub?: string) => (sub && RAIL_SUBTITLES[sub] ? t(RAIL_SUBTITLES[sub]) : sub);
  const feed = rails.filter((r) => r !== featured);
  const policy = await adPolicy();
  const adSlots = feedPositions(feed.length, policy.max.home, policy.minSectionsBetween, ["home-native", "home-display", "banner"]);
  return (
    <div className="space-y-7 sm:space-y-12">
      {welcome && <p role="status" className="rounded-2xl bg-success-soft px-4 py-3 text-sm font-medium text-success">{t("home.welcome")}</p>}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />

      {/* Phones: a large title and categories first, like the App Store and Google Play. The search tab lives in the bottom bar. */}
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight sm:hidden">{t("home.discover")}</h1>
      <nav aria-label={t("home.browse")} className="scrollbar-none -mx-4 -mt-1 flex gap-2 overflow-x-auto px-4 py-1 sm:hidden">
        <Link href="/search?sort=popular" className={chip}><ChartNoAxesColumn className="size-4 text-brand" aria-hidden />{t("home.topCharts")}</Link>
        <Link href="/categories" className={chip}><LayoutGrid className="size-4 text-brand" aria-hidden />{t("home.categories")}</Link>
        {tree.slice(0, 14).map((c) => (
          <Link key={c.id} href={`/c/${c.slug}`} className={chip}><CategoryIcon icon={c.icon} className="size-4 text-brand" />{catName(c)}</Link>
        ))}
      </nav>

      {/* Larger screens: a compact introduction with search. */}
      <section className="hero-glow hidden rounded-[2rem] border border-border px-8 pb-10 pt-12 sm:block">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            <Sparkles className="size-3.5 text-brand" aria-hidden /> {t("home.tagline")}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t("home.heroBefore")}<span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">{t("home.heroHighlight")}</span>{t("home.heroAfter")}
          </h1>
          <div className="mx-auto mt-8 max-w-2xl text-start"><SearchBox size="lg" suggested={suggested} /></div>
          <p className="mt-4 text-balance text-xs text-subtle">
            <ShieldCheck className="me-1 inline size-3.5 align-[-2px]" aria-hidden />{t("home.checked")}
          </p>
        </div>
      </section>

      {featured && <FeaturedCarousel label={featured.key === "featured" ? t("rail.featured") : t("home.editorsPick")} items={featured.items} sponsoredIds={featured.sponsoredIds} />}

      {personal.length > 0 && (
        <div className="space-y-8">
          {personal.map((r) => <StoreListSection key={r.key} title={r.title} items={r.items} />)}
          <p className="-mt-4 text-xs text-subtle">{t("home.personalised")} <Link href="/account/privacy" className="underline">{t("home.managePersonalisation")}</Link></p>
        </div>
      )}

      {rails.length === 0 && collections.length === 0 ? (
        <EmptyState title={t("home.emptyTitle")}>{t("home.emptyBody")}</EmptyState>
      ) : (
        feed.map((r, i) => (
          <Fragment key={r.key}>
            <StoreListSection title={railTitle(r)} subtitle={railSub(r.subtitle)} href={r.href} items={r.items} sponsoredIds={r.sponsoredIds} ranked={ranked.has(r.key)} />
            {/* Ads sit between whole sections, never inside a row of apps, spaced by the placement manager. */}
            {adSlots.get(i) === "banner" ? <AdBanner page="home" /> : adSlots.get(i) ? <Ad placement={adSlots.get(i) as "home-native" | "home-display"} page="home" /> : null}
          </Fragment>
        ))
      )}

      <section aria-labelledby="browse-categories" className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 id="browse-categories" className="text-[1.35rem] font-bold tracking-tight sm:text-2xl">{t("home.popularCategories")}</h2>
          <Link href="/categories" className="text-sm font-semibold text-brand hover:underline">{t("home.seeAll")}</Link>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {popularCats.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-semibold shadow-card transition hover:border-brand/40 hover:text-brand">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-soft"><CategoryIcon icon={c.icon} className="size-4 text-brand" /></span>
                <span className="min-w-0 flex-1 truncate">{catName(c)}</span>
                {(counts.get(c.id) ?? 0) > 0 && <span className="shrink-0 text-xs font-medium text-subtle">{counts.get(c.id)}<span className="sr-only"> {t("home.apps")}</span></span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {collections.length > 0 && (
        <section aria-labelledby="collections" className="space-y-5">
          <h2 id="collections" className="text-xl font-bold tracking-tight sm:text-2xl">{t("rail.collections")}</h2>
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
