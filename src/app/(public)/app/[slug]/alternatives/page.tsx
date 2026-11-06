import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardGrid } from "@/components/rail";
import { EmptyState } from "@/components/states";
import { isSampleListing } from "@/lib/labels";
import { relatedCandidateIds } from "@/server/catalog/alternatives";
import { cardsByIds, getPublicListing } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const l = await getPublicListing(await getViewerContext(), slug);
  if (!l) return { title: "Not found", robots: { index: false } };
  return {
    title: `Alternatives to ${l.name}`,
    description: `Compare web apps similar to ${l.name}: competitors, free and open-source alternatives.`,
    alternates: { canonical: `/app/${l.slug}/alternatives` },
    robots: isSampleListing(l.slug) ? { index: false } : undefined,
  };
}

export default async function AlternativesPage({ params }: Props) {
  const { slug } = await params;
  const ctx = await getViewerContext();
  const listing = await getPublicListing(ctx, slug);
  if (!listing) notFound();
  const items = await cardsByIds(ctx, (await relatedCandidateIds(listing.id, 48)).map((c) => c.id));
  return (
    <div className="space-y-6">
      <Link href={`/app/${listing.slug}`} className="text-sm text-muted hover:text-text">← Back to {listing.name}</Link>
      <h1 className="text-3xl font-extrabold tracking-tight">Alternatives to {listing.name}</h1>
      <p className="text-muted">Ranked by shared categories, tags and editorial comparisons. Not influenced by payment.</p>
      {items.length ? <CardGrid items={items} /> : <EmptyState title="No alternatives listed yet" />}
    </div>
  );
}
