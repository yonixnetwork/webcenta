import Link from "next/link";
import { Card } from "@/components/ui/form";
import { CategoryForm } from "@/components/portal/category-form";
import { StatusPill } from "@/components/portal/table";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { saveCategoryAction } from "@/server/actions/admin";

export const metadata = { title: "Categories" };

export default async function CategoriesAdmin() {
  await requireAdmin("catalog.manage");
  const cats = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { listings: true } } } });
  const roots = cats.filter((c) => !c.parentId);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Categories <span className="text-base font-normal text-muted">({cats.length})</span></h1>
      <Card><h2 className="mb-3 font-semibold">Add category</h2><CategoryForm action={saveCategoryAction.bind(null, null)} parents={roots.filter((r) => !r.mergedIntoId)} submitLabel="Add category" /></Card>
      <ul className="space-y-2">
        {roots.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-8 text-xs text-subtle">#{r.sortOrder}</span>
              <Link href={`/categories/${r.id}`} className="font-semibold text-brand hover:underline">{r.name}</Link>
              <span className="text-xs text-subtle">/{r.slug} · {r._count.listings} listings</span>
              <StatusPill status={r.riskTier} />{!r.isEnabled && <StatusPill status="DISABLED" />}{r.isRestricted && <StatusPill status="RESTRICTED" />}{r.mergedIntoId && <StatusPill status="MERGED" />}
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5 pl-10">
              {cats.filter((c) => c.parentId === r.id).map((c) => (
                <li key={c.id}><Link href={`/categories/${c.id}`} className={`inline-block rounded-full px-2 py-0.5 text-xs ${c.isRestricted || !c.isEnabled ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted"} hover:text-brand`}>{c.name} ({c._count.listings})</Link></li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
