import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { bulkImportsAction, importActionFor, queueImportsAction } from "@/server/actions/admin";
import { BulkForm } from "@/components/portal/bulk-form";
import { getSection } from "@/server/settings/store";
import { getAllCategoriesTree } from "@/server/catalog/admin-categories";

export const metadata = { title: "Import web apps" };

export default async function ImportsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("imports.manage");
  const status = (await searchParams).status;
  const filter = ["QUEUED", "IMPORTING", "IMPORTED", "FAILED", "SKIPPED"].includes(status ?? "") ? status : undefined;
  const [counts, rows, tree, s] = await Promise.all([
    db.importCandidate.groupBy({ by: ["status"], _count: { _all: true } }),
    db.importCandidate.findMany({ where: filter ? { status: filter as never } : {}, orderBy: [{ processedAt: "desc" }, { priority: "desc" }, { createdAt: "asc" }], take: 200 }),
    getAllCategoriesTree(),
    getSection("imports"),
  ]);
  const n = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  // Review state of imported listings (status, latest scan) for the table.
  const listings = await db.listing.findMany({
    where: { id: { in: rows.map((r) => r.listingId).filter((x): x is string => Boolean(x)) } },
    select: { id: true, status: true, revisions: { orderBy: { revisionNumber: "desc" }, take: 1, select: { id: true, status: true } }, scans: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { overallVerdict: true, riskScore: true } } },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const flatCats = tree.flatMap((c) => [{ id: c.id, label: c.name }, ...c.children.map((ch) => ({ id: ch.id, label: `${c.name} › ${ch.name}` }))]);
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
      <BulkForm action={bulkImportsAction} categories={flatCats}>
        <DataTable head={["", "Website", "Category", "Source", "Import", "Listing", "Checks", ""]} empty={rows.length === 0}>
          {rows.map((r) => {
            const l = r.listingId ? byId.get(r.listingId) : undefined;
            const scan = l?.scans[0];
            const pendingRev = l?.revisions[0] && ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(l.revisions[0].status) ? l.revisions[0] : undefined;
            return (
              <tr key={r.id}>
                <td className={td}><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.name ?? r.domain}`} className="size-4" /></td>
                <td className={td}><span className="font-medium">{r.name ?? r.domain}</span><br /><span className="text-xs text-subtle">{r.url}</span>{r.reviewRequired && <><br /><span className="text-xs font-semibold text-warning">Review required</span></>}</td>
                <td className={td}>{r.categorySlug}</td>
                <td className={td}>{r.source}</td>
                <td className={td}><StatusPill status={r.status} />{r.lastError && <p className="mt-1 max-w-56 text-xs text-muted">{r.lastError}</p>}</td>
                <td className={td}>{l ? <><StatusPill status={l.status} /><br />{pendingRev ? <Link href={`/submissions/${pendingRev.id}`} className="text-xs text-brand underline">Preview & review</Link> : <Link href={`/listings/${l.id}`} className="text-xs text-brand underline">Open</Link>}{" · "}<Link href={`/listings/${l.id}/edit`} className="text-xs text-brand underline">Edit</Link></> : <span className="text-xs text-subtle">{r.processedAt ? formatDate(r.processedAt) : "—"}</span>}</td>
                <td className={td}>{scan ? <span className="text-xs">{scan.overallVerdict} · risk {scan.riskScore ?? "?"}</span> : <span className="text-xs text-subtle">—</span>}</td>
                <td className={td}>
                  {r.status !== "IMPORTED" && (
                    <span className="flex gap-1">
                      <button formAction={importActionFor.bind(null, r.id, "now")} className={buttonClass("secondary", "sm")}>Import now</button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </BulkForm>
    </>
  );
}
