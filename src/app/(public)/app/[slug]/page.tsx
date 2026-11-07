import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck, CalendarCheck, ChevronRight, Globe, ShieldCheck, ShieldQuestion, Star, TriangleAlert, UserRound } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { RelatedRails } from "@/components/listing-sections";
import { ReportForm } from "@/components/report-form";
import { ShareButton } from "@/components/share-button";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { AGE_LABEL, PLATFORM_LABEL, PRICING_LABEL, SECURITY_LABEL, VERIFICATION_LABEL, formatDate, isSampleListing } from "@/lib/labels";
import { displayDomain } from "@/lib/url";
import { getRelated } from "@/server/catalog/alternatives";
import { getPublicListing, MIN_RATINGS_FOR_DISPLAY } from "@/server/catalog/listings";
import { submitListingReport } from "@/server/catalog/report-action";
import { LISTING_REPORT_REASONS } from "@/server/moderation/reports";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { FavoriteButton } from "@/components/community/favorite-button";
import { AddToCollection } from "@/components/community/add-to-collection";
import { ReviewsSection } from "@/components/community/reviews-section";
import { ViewTracker } from "@/components/community/view-tracker";
import { mediaUrl } from "@/server/storage";

type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<{ sort?: string; rpage?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getPublicListing(await getViewerContext(), slug);
  if (!listing) return { title: "App not found", robots: { index: false } };
  const description = listing.tagline ?? listing.description.slice(0, 155);
  return {
    title: `${listing.name} — ${listing.primaryCategory?.name ?? "Web app"}`,
    description,
    alternates: { canonical: `/app/${listing.slug}` },
    openGraph: { title: listing.name, description, url: `/app/${listing.slug}` },
    robots: isSampleListing(listing.slug) ? { index: false } : undefined,
  };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function AppPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const ctx = await getViewerContext();
  const listing = await getPublicListing(ctx, slug);
  if (!listing) notFound();
  const user = await getCurrentUser();
  const [favorite, myCollections, membership] = user ? await Promise.all([
    db.favorite.findUnique({ where: { userId_listingId: { userId: user.id, listingId: listing.id } } }),
    db.collection.findMany({ where: { ownerId: user.id }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    listing.developerId ? db.developerMember.findUnique({ where: { orgId_userId: { orgId: listing.developerId, userId: user.id } } }) : null,
  ]) : [null, [], null];

  const related = await getRelated(ctx, listing);
  const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
  const domain = displayDomain(listing.websiteUrl);
  const security = SECURITY_LABEL[listing.securityStatus];
  const logo = listing.media.find((m) => m.kind === "LOGO");
  const screenshots = listing.media.filter((m) => m.kind === "SCREENSHOT" || m.kind === "PREVIEW");
  const showRating = listing.ratingCount >= MIN_RATINGS_FOR_DISPLAY;
  const verification = listing.developer ? VERIFICATION_LABEL[listing.developer.verificationLevel] : "Unclaimed listing";
  const reportAction = submitListingReport.bind(null, listing.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: listing.name,
    description: listing.tagline ?? listing.description.slice(0, 300),
    url: listing.websiteUrl,
    applicationCategory: listing.primaryCategory?.name,
    operatingSystem: listing.platforms.map((p) => PLATFORM_LABEL[p]).join(", "),
    author: { "@type": "Organization", name: listing.publisherName },
    ...(listing.pricingModel === "FREE" ? { offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } } : {}),
    ...(showRating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: listing.ratingAverage.toFixed(1), ratingCount: listing.ratingCount } } : {}),
  };

  return (
    <article className="space-y-12">
      <ViewTracker slug={listing.slug} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/categories" className="hover:text-text">Categories</Link>
        {listing.primaryCategory?.parent && (<><ChevronRight className="size-4" aria-hidden /><Link href={`/c/${listing.primaryCategory.parent.slug}`} className="hover:text-text">{listing.primaryCategory.parent.name}</Link></>)}
        {listing.primaryCategory && (<><ChevronRight className="size-4" aria-hidden /><Link href={`/c/${listing.primaryCategory.slug}`} className="hover:text-text">{listing.primaryCategory.name}</Link></>)}
      </nav>

      {isSampleListing(listing.slug) && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning">This is a fictional sample listing for development. The website does not exist.</p>
      )}

      <header className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex flex-1 items-start gap-4 sm:gap-6">
          <AppIcon name={listing.name} storageKey={logo?.asset.storageKey} size="lg" />
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{listing.name}</h1>
            {listing.tagline && <p className="text-lg text-muted">{listing.tagline}</p>}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-brand">{listing.publisherName}</span>
              {listing.developer && listing.developer.verificationLevel !== "UNVERIFIED" && <BadgeCheck className="size-4 text-brand" aria-label={verification} />}
              {listing.source === "EDITORIAL" && <span className="text-subtle">· Listed by Webcenta editors</span>}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge tone={listing.pricingModel === "FREE" ? "success" : "neutral"}>{PRICING_LABEL[listing.pricingModel]}</Badge>
              {listing.isOpenSource && <Badge tone="brand">Open source</Badge>}
              {listing.isPwaInstallable && <Badge>Installable PWA</Badge>}
              <Badge tone="outline">Age {AGE_LABEL[listing.ageRating]}</Badge>
              {showRating && <Badge><Star className="size-3 fill-current text-amber-500" aria-hidden /> {listing.ratingAverage.toFixed(1)} ({listing.ratingCount})</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col">
          {/* Full-page navigation on purpose: the interstitial must load as its own document so
              its CSP (form-action allowing the https redirect) applies. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href={`/go/${listing.slug}`} rel="nofollow" className={buttonClass("primary", "lg", "w-full sm:w-auto lg:w-64")}>
            Visit website <ArrowUpRight className="size-5" aria-hidden />
          </a>
          <p className="text-center text-xs text-subtle lg:w-64">Opens {domain} · you’ll see a notice before leaving Webcenta</p>
          <div className="flex gap-2 sm:ml-2 lg:ml-0">
            <ShareButton url={`${origin}/app/${listing.slug}`} title={listing.name} />
            <FavoriteButton slug={listing.slug} initial={Boolean(favorite)} signedIn={Boolean(user)} />
            {user && <AddToCollection slug={listing.slug} collections={myCollections} />}
          </div>
        </div>
      </header>

      {listing.securityStatus === "WARNING" || listing.securityStatus === "UNDER_INVESTIGATION" ? (
        <div role="alert" className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <TriangleAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <p><strong className="text-warning">{security.label}.</strong> {security.detail}</p>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <section aria-labelledby="screens">
            <h2 id="screens" className="mb-4 text-xl font-bold">Screenshots</h2>
            {screenshots.length ? (
              <ul className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {screenshots.map((s) => (
                  <li key={s.id} className="shrink-0 snap-start">
                    {/* eslint-disable-next-line @next/next/no-img-element -- media host configured at runtime */}
                    <img src={mediaUrl(s.asset.storageKey)} alt={s.altText ?? `${listing.name} screenshot`} loading="lazy" decoding="async"
                      width={s.asset.width ?? undefined} height={s.asset.height ?? undefined}
                      className="h-56 w-auto rounded-2xl border border-border object-cover sm:h-72" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">No screenshots have been provided yet.</p>
            )}
          </section>

          <section aria-labelledby="about">
            <h2 id="about" className="mb-3 text-xl font-bold">About {listing.name}</h2>
            <div className="whitespace-pre-line text-pretty leading-relaxed text-muted">{listing.description}</div>
          </section>

          {listing.features.length > 0 && (
            <section aria-labelledby="features">
              <h2 id="features" className="mb-3 text-xl font-bold">Features</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {listing.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"><span className="size-1.5 rounded-full bg-brand" aria-hidden />{f}</li>
                ))}
              </ul>
            </section>
          )}

          <ReviewsSection listing={listing} user={user} isMember={Boolean(membership)}
            canReply={Boolean(membership && membership.role !== "ANALYST")}
            sort={sp.sort === "newest" ? "newest" : "helpful"} page={Math.max(1, Number(sp.rpage) || 1)} />
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="trust" className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 id="trust" className="mb-2 font-bold">Trust & safety</h2>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                {listing.securityStatus === "PASSED" ? <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden /> : <ShieldQuestion className="size-5 shrink-0 text-muted" aria-hidden />}
                <span><span className="font-medium">Security scan: {security.label}</span><br /><span className="text-muted">{security.detail}</span>
                  {listing.lastScannedAt && <><br /><span className="text-subtle">Last scanned {formatDate(listing.lastScannedAt)}</span></>}</span>
              </li>
              <li className="flex gap-3">
                <CalendarCheck className="size-5 shrink-0 text-muted" aria-hidden />
                <span><span className="font-medium">Last verified</span><br /><span className="text-muted">{listing.lastVerifiedAt ? formatDate(listing.lastVerifiedAt) : "Not yet verified"}</span></span>
              </li>
              <li className="flex gap-3">
                <UserRound className="size-5 shrink-0 text-muted" aria-hidden />
                <span><span className="font-medium">{verification}</span><br />
                  <span className="text-muted">{listing.developer ? `Managed by ${listing.developer.displayName}` : "Added by Webcenta editors and credited to the original publisher. Developers will be able to claim listings after verifying ownership."}</span></span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="info" className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <h2 id="info" className="font-bold">Information</h2>
            <dl className="mt-2 divide-y divide-border">
              <Fact label="Website"><span className="inline-flex items-center gap-1"><Globe className="size-3.5" aria-hidden />{domain}</span></Fact>
              <Fact label="Publisher">{listing.publisherName}</Fact>
              <Fact label="Pricing">{PRICING_LABEL[listing.pricingModel]}{listing.pricingDetails ? ` — ${listing.pricingDetails}` : ""}</Fact>
              <Fact label="Platforms">{listing.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</Fact>
              <Fact label="Age rating">{AGE_LABEL[listing.ageRating]}</Fact>
              <Fact label="Countries">{listing.supportedCountries.length ? listing.supportedCountries.join(", ") : "Worldwide (as declared)"}</Fact>
              {listing.languages.length > 0 && <Fact label="Languages">{listing.languages.join(", ").toUpperCase()}</Fact>}
              <Fact label="Listed since">{formatDate(listing.publishedAt)}</Fact>
              {listing.contentUpdatedAt && <Fact label="Last updated">{formatDate(listing.contentUpdatedAt)}</Fact>}
            </dl>
          </section>

          <section aria-labelledby="tags">
            <h2 id="tags" className="mb-2 text-sm font-semibold text-muted">Categories & tags</h2>
            <ul className="flex flex-wrap gap-1.5">
              {listing.categories.map(({ category }) => (
                <li key={category.id}><Link href={`/c/${category.slug}`} className="inline-block rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand/40 hover:text-brand">{category.name}</Link></li>
              ))}
              {listing.tags.map(({ tag }) => (
                <li key={tag.id}><Link href={`/search?q=${encodeURIComponent(tag.name)}`} className="inline-block rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-brand">#{tag.name}</Link></li>
              ))}
            </ul>
          </section>

          <ReportForm action={reportAction} reasons={LISTING_REPORT_REASONS} />
        </aside>
      </div>

      <div className="space-y-12">
        <RelatedRails groups={related} name={listing.name} />
        {related.similar.length > 0 && (
          <p><Link href={`/app/${listing.slug}/alternatives`} className="text-sm font-semibold text-brand hover:underline">See all alternatives to {listing.name} →</Link></p>
        )}
      </div>
    </article>
  );
}
