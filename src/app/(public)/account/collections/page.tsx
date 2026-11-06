import Link from "next/link";
import { EmptyState } from "@/components/states";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, Field, inputClass } from "@/components/ui/form";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { createCollectionAction } from "@/server/actions/user";

export default async function CollectionsPage() {
  const user = await requireUser("/account/collections");
  const cols = await db.collection.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { items: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Collections</h1>
      <Card>
        <h2 className="mb-3 font-semibold">New collection</h2>
        <ActionForm action={createCollectionAction} submitLabel="Create collection">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Field label="Title"><input name="title" required maxLength={80} className={inputClass} /></Field>
            <Field label="Visibility">
              <select name="visibility" className={inputClass} defaultValue="PRIVATE">
                <option value="PRIVATE">Private</option><option value="UNLISTED">Unlisted (link only)</option><option value="PUBLIC">Public</option>
              </select>
            </Field>
          </div>
          <Field label="Description (optional)"><textarea name="description" maxLength={500} rows={2} className={inputClass} /></Field>
        </ActionForm>
      </Card>
      {cols.length === 0 ? <EmptyState title="No collections yet">Group apps into lists, such as “Tools for my startup”.</EmptyState> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {cols.map((c) => (
            <li key={c.id}><Link href={`/account/collections/${c.id}`} className="block rounded-2xl border border-border bg-surface p-4 hover:border-brand/40">
              <span className="font-semibold">{c.title}</span>
              <span className="mt-1 flex items-center gap-2 text-xs text-muted">{c._count.items} apps <Badge tone="outline">{c.visibility.toLowerCase()}</Badge></span>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}
