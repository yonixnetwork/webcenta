import type { Metadata } from "next";
import { headers } from "next/headers";
import { PackageX } from "lucide-react";
import { ErrorPage } from "@/components/error-page";
import { CardGrid } from "@/components/rail";
import { getRelated } from "@/server/catalog/alternatives";
import { listCards, type ListingCard } from "@/server/catalog/listings";
import { db } from "@/server/db";
import { getViewerContext } from "@/server/viewer";

export const metadata: Metadata = { title: "Application not available", robots: { index: false } };

const SLUG = /^\/app\/([a-z0-9-]{1,120})\/?$/;

/**
 * 404 for /app/:slug when the listing doesn't exist or isn't visible to this
 * visitor (removed, suspended, under review, or restricted by region/age).
 * The reason is deliberately generic: moderation details are never exposed.
 * Suggestions only ever contain listings that are publicly visible to this visitor.
 */
export default async function AppNotFound() {
  const path = (await headers()).get("x-pathname") ?? "";
  const slug = SLUG.exec(path)?.[1];
  const ctx = await getViewerContext();
  // Only listings that were public at some point are named; never drafts or rejected submissions.
  const known = slug
    ? await db.listing.findFirst({
        where: { slug, publishedAt: { not: null } },
        select: { id: true, name: true, pricingModel: true, isOpenSource: true, ratingAverage: true, ratingCount: true, primaryCategoryId: true, primaryCategory: { select: { name: true, slug: true } } },
      }).catch(() => null)
    : null;

  let sameCategory: ListingCard[] = [];
  let alternatives: ListingCard[] = [];
  let popular: ListingCard[] = [];
  try {
    if (known) {
      const [rel, cat] = await Promise.all([
        getRelated(ctx, known),
        known.primaryCategoryId
          ? listCards(ctx, { where: { primaryCategoryId: known.primaryCategoryId, id: { not: known.id } }, orderBy: [{ popularityScore: "desc" }, { publishedAt: "desc" }], take: 6 })
          : Promise.resolve([]),
      ]);
      sameCategory = cat;
      const seen = new Set([known.id, ...cat.map((c) => c.id)]);
      alternatives = [...rel.similar, ...rel.freeAlternatives, ...rel.openSourceAlternatives]
        .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
        .slice(0, 6);
    }
    if (sameCategory.length + alternatives.length === 0) {
      popular = await listCards(ctx, { orderBy: [{ popularityScore: "desc" }, { publishedAt: "desc" }], take: 6 });
    }
  } catch {
    // Suggestions are optional; the page must still render if the database is struggling.
  }

  return (
    <div className="space-y-12">
      <ErrorPage code="404" title={known ? `${known.name} isn’t available` : "Application not found"} icon={<PackageX className="size-8" aria-hidden />} showCategories={!known}>
        {known ? (
          <p>This application isn’t available on Webcenta right now. It may have been removed, may be temporarily unavailable, or may not be offered in your region or for your account.</p>
        ) : (
          <p>We couldn’t find an application at this address. It may have been renamed or removed. Try searching for it, or explore the suggestions below.</p>
        )}
      </ErrorPage>

      {sameCategory.length > 0 && known?.primaryCategory && (
        <section aria-labelledby="same-cat" className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <h2 id="same-cat" className="text-xl font-bold">More in {known.primaryCategory.name}</h2>
            <a href={`/c/${known.primaryCategory.slug}`} className="text-sm font-semibold text-brand">See all</a>
          </div>
          <CardGrid items={sameCategory} />
        </section>
      )}
      {alternatives.length > 0 && (
        <section aria-labelledby="alts" className="space-y-4">
          <h2 id="alts" className="text-xl font-bold">Similar apps and alternatives</h2>
          <CardGrid items={alternatives} />
        </section>
      )}
      {popular.length > 0 && (
        <section aria-labelledby="popular" className="space-y-4">
          <h2 id="popular" className="text-xl font-bold">Popular on Webcenta</h2>
          <CardGrid items={popular} />
        </section>
      )}
    </div>
  );
}
