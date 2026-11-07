import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingEditor } from "@/components/portal/listing-editor";
import { db } from "@/server/db";
import { getCategoryTree } from "@/server/catalog/categories";
import { requireDevPage } from "@/server/developer/context";
import { revisionMedia } from "@/server/developer/media";
import type { ListingInput } from "@/server/listings/input";
import { saveListingAction, uploadMediaAction } from "@/server/actions/developer";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireDevPage("EDITOR", `/developer/listings/${id}/edit`);
  const listing = await db.listing.findFirst({ where: { id, developerId: ctx.org.id }, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } } });
  if (!listing) notFound();
  const latest = listing.revisions[0];
  const pending = latest && ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(latest.status);
  const data = (latest?.data ?? {}) as Partial<ListingInput>;
  return (
    <>
      <Link href={`/developer/listings/${id}`} className="text-sm text-muted hover:text-text">← {listing.name}</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Edit listing</h1>
      {pending ? <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">An update is under review. You can edit again after the decision.</p> : (
        <ListingEditor action={saveListingAction.bind(null, id)} upload={uploadMediaAction} tree={await getCategoryTree()} initial={data}
          media={await revisionMedia(data)} submitLabel="Save draft" />
      )}
    </>
  );
}
