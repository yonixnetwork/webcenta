import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardGrid } from "@/components/rail";
import { EmptyState } from "@/components/states";
import { getPublicCollection } from "@/server/catalog/homepage";
import { getViewerContext } from "@/server/viewer";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getPublicCollection(await getViewerContext(), slug);
  if (!c) return { title: "Collection not found", robots: { index: false } };
  return {
    title: c.title, description: c.description ?? undefined, alternates: { canonical: `/collections/${c.slug}` },
    robots: c.visibility === "UNLISTED" || !c.isEditorial || c.slug.startsWith("sample-") ? { index: false } : undefined,
  };
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const c = await getPublicCollection(await getViewerContext(), slug);
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-brand-soft to-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{c.isEditorial ? "Curated collection" : `Collection by ${c.owner?.name ?? "a Webcenta user"}`}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{c.title}</h1>
        {c.description && <p className="mt-2 max-w-2xl text-muted">{c.description}</p>}
      </header>
      {c.cards.length ? <CardGrid items={c.cards} /> : <EmptyState title="This collection is empty" />}
    </div>
  );
}
