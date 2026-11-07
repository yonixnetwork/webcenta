import { ListingEditor } from "@/components/portal/listing-editor";
import { getCategoryTree } from "@/server/catalog/categories";
import { requireDev } from "@/server/developer/context";
import { saveListingAction, uploadMediaAction } from "@/server/actions/developer";

export const metadata = { title: "Submit an app" };

export default async function NewListingPage() {
  const ctx = await requireDev("EDITOR", "/developer/listings/new");
  const tree = await getCategoryTree();
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Submit an app</h1>
      <p className="text-sm text-muted">Save a draft first. You can submit it for review from the listing page once your domain is verified.</p>
      <ListingEditor action={saveListingAction.bind(null, null)} upload={uploadMediaAction} tree={tree} initial={{ publisherName: ctx.org.displayName }} media={{ logo: [], screenshots: [] }} submitLabel="Save draft" />
    </>
  );
}
