import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { CategoryForm } from "@/components/portal/category-form";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { addGeoRestrictionAction, mergeCategoryAction, removeGeoRestrictionAction, saveCategoryAction } from "@/server/actions/admin";

export default async function CategoryAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("catalog.manage");
  const { id } = await params;
  const c = await db.category.findUnique({ where: { id }, include: { geoRestrictions: true, mergedInto: true } });
  if (!c) notFound();
  const all = await db.category.findMany({ where: { mergedIntoId: null, id: { not: id } }, orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } });
  return (
    <>
      <Link href="/categories" className="text-sm text-muted hover:text-text">← Categories</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">{c.name}</h1>
      {c.mergedInto && <p className="text-sm text-warning">Merged into {c.mergedInto.name}.</p>}
      <Card><CategoryForm action={saveCategoryAction.bind(null, id)} parents={all.filter((a) => !a.parentId)} initial={c} submitLabel="Save category" /></Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">Country restrictions (whole category)</h2>
        <ul className="flex flex-wrap gap-2 text-sm">{c.geoRestrictions.map((g) => <li key={g.id} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">{g.countryCode}<form action={removeGeoRestrictionAction.bind(null, g.id)}><button className="text-danger" aria-label={`Remove ${g.countryCode}`}>×</button></form></li>)}{c.geoRestrictions.length === 0 && <li className="text-muted">None</li>}</ul>
        <ActionForm action={addGeoRestrictionAction.bind(null, { categoryId: id })} submitLabel="Hide category in country" variant="secondary">
          <div className="grid gap-2 sm:grid-cols-[100px_1fr]"><Field label="Country"><input name="countryCode" required maxLength={2} className={`${inputClass} uppercase`} /></Field><Field label="Legal reason"><input name="reason" required minLength={3} className={inputClass} /></Field></div>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Merge into another category</h2>
        <p className="mb-3 text-sm text-muted">Moves all listings to the target and disables this category. Subcategories must be moved first.</p>
        <ActionForm action={mergeCategoryAction.bind(null, id)} submitLabel="Merge" variant="secondary">
          <Field label="Target"><select name="targetId" required className={inputClass}><option value="">Choose…</option>{all.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </ActionForm>
      </Card>
    </>
  );
}
