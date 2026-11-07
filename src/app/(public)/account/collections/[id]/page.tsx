import Link from "next/link";
import { notFound } from "next/navigation";
import { AppCard } from "@/components/app-card";
import { EmptyState } from "@/components/states";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/form";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { cardsByIds } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";
import { deleteCollectionAction, removeFromCollectionAction, updateCollectionAction } from "@/server/actions/user";

export default async function CollectionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/account/collections/${id}`);
  const c = await db.collection.findFirst({ where: { id, ownerId: user.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!c) notFound();
  const cards = await cardsByIds(await getViewerContext(), c.items.map((i) => i.listingId));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{c.title}</h1>
        {c.visibility !== "PRIVATE" && <Link href={`/collections/${c.slug}`} className="text-sm font-semibold text-brand hover:underline">View shared page →</Link>}
      </div>
      {cards.length === 0 ? <EmptyState title="This collection is empty">Use “Add to collection” on any app page.</EmptyState> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((a) => (
            <li key={a.id} className="space-y-2">
              <AppCard app={a} />
              <form action={removeFromCollectionAction.bind(null, c.id, a.id)}><button type="submit" className={buttonClass("ghost", "sm")}>Remove</button></form>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <h2 className="mb-3 font-semibold">Settings</h2>
        <ActionForm action={updateCollectionAction.bind(null, c.id)} submitLabel="Save">
          <Field label="Title"><input name="title" required maxLength={80} defaultValue={c.title} className={inputClass} /></Field>
          <Field label="Description"><textarea name="description" maxLength={500} rows={2} defaultValue={c.description ?? ""} className={inputClass} /></Field>
          <Field label="Visibility">
            <select name="visibility" defaultValue={c.visibility} className={inputClass}>
              <option value="PRIVATE">Private</option><option value="UNLISTED">Unlisted (link only)</option><option value="PUBLIC">Public</option>
            </select>
          </Field>
        </ActionForm>
        <form action={deleteCollectionAction.bind(null, c.id)} className="mt-4 border-t border-border pt-4">
          <button type="submit" className={buttonClass("ghost", "sm", "text-danger")}>Delete collection</button>
        </form>
      </Card>
    </>
  );
}
