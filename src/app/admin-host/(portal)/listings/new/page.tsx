import { ListingEditor } from "@/components/portal/listing-editor";
import { Card, Field, inputClass } from "@/components/ui/form";
import { requireAdmin } from "@/server/admin/auth";
import { getAllCategoriesTree } from "@/server/catalog/admin-categories";
import { adminUploadAction, createEditorialAction } from "@/server/actions/admin";

export const metadata = { title: "New editorial listing" };

export default async function NewEditorial() {
  await requireAdmin("listings.moderate");
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">New editorial listing</h1>
      <p className="text-sm text-muted">Credit the original publisher. WebCenter never claims to own or build listed apps. The listing goes through the same automated checks and must be approved in Submissions before publication; the developer can later claim it.</p>
      <ListingEditor action={createEditorialAction} upload={adminUploadAction} tree={await getAllCategoriesTree()} media={{ logo: [], screenshots: [] }} submitLabel="Create and run checks"
        extra={<Card><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Source (where did you find this app?)"><input name="editorialSource" required minLength={3} maxLength={300} className={inputClass} /></Field>
          <Field label="Verification evidence (what did you check?)"><input name="editorialEvidence" maxLength={1000} className={inputClass} /></Field>
        </div></Card>} />
    </>
  );
}
