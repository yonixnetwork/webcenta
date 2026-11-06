import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { collectionItemAction, collectionRemoveAction, createEditorialCollectionAction, removePlacementAction, updateSectionAction } from "@/server/actions/admin";

export const metadata = { title: "Homepage & curation" };

export default async function HomepageAdmin() {
  await requireAdmin("catalog.manage");
  const [sections, placements, collections] = await Promise.all([
    db.homepageSection.findMany({ orderBy: { sortOrder: "asc" } }),
    db.featuredPlacement.findMany({ where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: [{ slot: "asc" }, { sortOrder: "asc" }], include: { listing: { select: { name: true, id: true } } } }),
    db.collection.findMany({ where: { isEditorial: true }, include: { items: { orderBy: { sortOrder: "asc" }, include: { listing: { select: { name: true, id: true } } } } } }),
  ]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Homepage & curation</h1>
      <h2 className="text-lg font-bold">Sections</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.id}>
            <p className="mb-2 text-xs text-subtle">{s.type.toLowerCase()} · key “{s.key}”</p>
            <ActionForm action={updateSectionAction.bind(null, s.id)} submitLabel="Save" variant="secondary">
              <div className="grid gap-2 sm:grid-cols-[1fr_90px]"><Field label="Title"><input name="title" defaultValue={s.title} className={inputClass} /></Field><Field label="Order"><input name="sortOrder" type="number" defaultValue={s.sortOrder} className={inputClass} /></Field></div>
              <Field label="Config (JSON, optional)"><input name="config" defaultValue={s.config ? JSON.stringify(s.config) : ""} className={`${inputClass} font-mono text-xs`} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isEnabled" defaultChecked={s.isEnabled} className="size-4 accent-[var(--brand)]" />Enabled</label>
            </ActionForm>
          </Card>
        ))}
      </div>
      <h2 className="text-lg font-bold">Active placements</h2>
      <p className="text-sm text-muted">Add editorial placements from an application’s admin page. Sponsored placements come from approved requests (Monetisation) and are always labelled.</p>
      <ul className="space-y-1 text-sm">{placements.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2">{p.slot.toLowerCase()} · <Link href={`/listings/${p.listing.id}`} className="text-brand">{p.listing.name}</Link> {p.isSponsored && <StatusPill status="SPONSORED" />} · {formatDate(p.startsAt)} → {p.endsAt ? formatDate(p.endsAt) : "open"}<form action={removePlacementAction.bind(null, p.id)}><button className="text-xs text-danger">remove</button></form></li>)}</ul>
      <h2 className="text-lg font-bold">Editorial collections</h2>
      <Card><ActionForm action={createEditorialCollectionAction} submitLabel="Create collection"><div className="grid gap-2 sm:grid-cols-2"><Field label="Title"><input name="title" required className={inputClass} /></Field><Field label="Description"><input name="description" className={inputClass} /></Field></div></ActionForm></Card>
      {collections.map((c) => (
        <Card key={c.id} className="space-y-2">
          <h3 className="font-semibold">{c.title} <span className="text-xs text-subtle">/collections/{c.slug}</span></h3>
          <ul className="flex flex-wrap gap-2 text-sm">{c.items.map((i) => <li key={i.listingId} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">{i.listing.name}<form action={collectionRemoveAction.bind(null, c.id, i.listingId)}><button className="text-danger" aria-label={`Remove ${i.listing.name}`}>×</button></form></li>)}</ul>
          <ActionForm action={collectionItemAction.bind(null, c.id)} submitLabel="Add listing" variant="secondary"><Field label="Listing slug or URL"><input name="slug" required className={inputClass} /></Field></ActionForm>
        </Card>
      ))}
    </>
  );
}
