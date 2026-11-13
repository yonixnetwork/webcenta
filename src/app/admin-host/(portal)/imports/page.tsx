import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { importActionFor, queueImportsAction } from "@/server/actions/admin";
import { getSection } from "@/server/settings/store";
import { getAllCategoriesTree } from "@/server/catalog/admin-categories";

export const metadata = { title: "Import web apps" };

export default async function ImportsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("imports.manage");
  const status = (await searchParams).status;
  const filter = ["QUEUED", "IMPORTING", "IMPORTED", "FAILED", "SKIPPED"].includes(status ?? "") ? status : undefined;
  const [counts, rows, tree, s] = await Promise.all([
    db.importCandidate.groupBy({ by: ["status"], _count: { _all: true } }),
    db.importCandidate.findMany({ where: filter ? { status: filter as never } : {}, orderBy: [{ processedAt: "desc" }, { priority: "desc" }, { createdAt: "asc" }], take: 150 }),
    getAllCategoriesTree(),
    getSection("imports"),
  ]);
  const n = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Import web apps</h1>
      <Card>
        <p className="text-sm text-muted">
          {s.enabled
            ? <>Automatic import is <strong className="text-success">on</strong>: {s.num("perRun") || 4} web app(s) every {s.num("intervalMinutes") || 30} minutes. </>
            : <>Automatic import is <strong className="text-danger">off</strong>. </>}
          Each app gets the name, description, logo and screenshots its website publishes, then the normal security checks.
          {s.bool("autoPublish") ? " Apps that pass every check in low-risk categories are published automatically; the rest wait in " : " Every imported app waits in "}
          <Link href="/submissions" className="text-brand underline">Submissions</Link>. <Link href="/settings/imports" className="text-brand underline">Change settings</Link>
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-sm">
          {["QUEUED", "IMPORTED", "FAILED", "SKIPPED"].map((k) => <Link key={k} href={`/imports?status=${k}`} className="rounded-full border border-border px-3 py-1 hover:border-brand">{k.toLowerCase()} · {n(k)}</Link>)}
          {filter && <Link href="/imports" className="rounded-full px-3 py-1 text-brand">show all</Link>}
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Add web apps</h2>
        <ActionForm action={queueImportsAction} submitLabel="Add to queue" pendingLabel="Working…">
          <Field label="Website addresses" hint="One per line (up to 200). https:// is added when missing."><textarea name="urls" required rows={4} className={inputClass} placeholder={"https://www.notion.so\nhttps://www.canva.com"} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <select name="category" required className={inputClass}>
                {tree.map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.slug}>{c.name}</option>
                    {c.children.map((ch) => <option key={ch.id} value={ch.slug}>{c.name} › {ch.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Name (optional, single address only)"><input name="name" maxLength={120} className={inputClass} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="now" value="1" className="size-4" />Import a single address immediately instead of waiting for the schedule</label>
        </ActionForm>
      </Card>
      <DataTable head={["Website", "Category", "Source", "Status", "Detail", ""]} empty={rows.length === 0}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={td}><span className="font-medium">{r.name ?? r.domain}</span><br /><span className="text-xs text-subtle">{r.url}</span></td>
            <td className={td}>{r.categorySlug}</td>
            <td className={td}>{r.source}</td>
            <td className={td}><StatusPill status={r.status} /></td>
            <td className={td}>{r.listingId ? <Link href={`/listings/${r.listingId}`} className="text-brand underline">Open listing</Link> : <span className="text-xs text-muted">{r.lastError ?? (r.processedAt ? formatDate(r.processedAt) : "")}</span>}</td>
            <td className={td}>
              {r.status !== "IMPORTED" && (
                <span className="flex gap-1">
                  <form action={importActionFor.bind(null, r.id, "now")}><button className={buttonClass("secondary", "sm")}>Import now</button></form>
                  {r.status !== "SKIPPED" && <form action={importActionFor.bind(null, r.id, "skip")}><button className={buttonClass("ghost", "sm")}>Skip</button></form>}
                </span>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
