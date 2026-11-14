import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { bulkImportsAction, queueImportsAction } from "@/server/actions/admin";
import { eligibleListingIds } from "@/server/importer/bulk";
import { BulkForm } from "@/components/portal/bulk-form";
import { getSection } from "@/server/settings/store";
import { getAllCategoriesTree } from "@/server/catalog/admin-categories";

export const metadata = { title: "Import web apps" };

export default async function ImportsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("imports.manage");
  const status = (await searchParams).status;
  const filter = ["QUEUED", "IMPORTING", "IMPORTED", "FAILED", "SKIPPED"].includes(status ?? "") ? status : undefined;
  const [counts, rows, tree, s, eligibleSet, cleanups] = await Promise.all([
    db.importCandidate.groupBy({ by: ["status"], _count: { _all: true } }),
    db.importCandidate.findMany({ where: filter ? { status: filter as never } : {}, orderBy: [{ processedAt: "desc" }, { priority: "desc" }, { createdAt: "asc" }], take: 200 }),
    getAllCategoriesTree(),
    getSection("imports"),
    eligibleListingIds(),
    db.auditLog.findMany({ where: { action: "imports.cleanup" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, createdAt: true, metadata: true } }),
  ]);
  const eligible = eligibleSet.size;
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
      <BulkForm action={bulkImportsAction} categories={flatCats} eligible={eligible} failed={n("FAILED")}>
        <DataTable head={["", "Website", "Category", "Source", "Import", "Listing", "Checks", ""]} empty={rows.length === 0}>
          {rows.map((r) => {
            const l = r.listingId ? byId.get(r.listingId) : undefined;
            const scan = l?.scans[0];
            const pendingRev = l?.revisions[0] && ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(l.revisions[0].status) ? l.revisions[0] : undefined;
            return (
              <tr key={r.id}>
                <td className={td}><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.name ?? r.domain}`} data-eligible={r.listingId && eligibleSet.has(r.listingId) ? "1" : undefined} className="size-4" /></td>
                <td className={td}><span className="font-medium">{r.name ?? r.domain}</span><br /><span className="text-xs text-subtle">{r.url}</span>{r.reviewRequired && <><br /><span className="text-xs font-semibold text-warning">Review required</span></>}</td>
                <td className={td}>{r.categorySlug}</td>
                <td className={td}>{r.source}</td>
                <td className={td}>
                  <StatusPill status={r.status} />
                  <p className="mt-1 font-mono text-[11px] text-subtle" title="Import job ID">#{r.id.slice(-8)}</p>
                  {r.lastError && (
                    <details className="mt-1 max-w-64 text-xs" data-testid="import-error">
                      <summary className="cursor-pointer text-danger">{r.failedStage ? `Failed at ${r.failedStage}` : "Error"}{r.errorCategory ? ` · ${r.errorCategory}` : ""}</summary>
                      <p className="mt-1 text-muted">{r.lastError}</p>
                      <p className="text-subtle">{r.retryable ? "Can be retried" : "Retrying will not help until the cause is fixed"} · attempts {r.attempts} · {r.processedAt ? formatDate(r.processedAt) : ""}</p>
                    </details>
                  )}
                </td>
                <td className={td}>{l ? <><StatusPill status={l.status} /><br />{pendingRev ? <Link href={`/submissions/${pendingRev.id}`} className="text-xs text-brand underline">Preview & review</Link> : <Link href={`/listings/${l.id}`} className="text-xs text-brand underline">Open</Link>}{" · "}<Link href={`/listings/${l.id}/edit`} className="text-xs text-brand underline">Edit</Link></> : <span className="text-xs text-subtle">{r.processedAt ? formatDate(r.processedAt) : "—"}</span>}</td>
                <td className={td}>{scan ? <span className="text-xs">{scan.overallVerdict} · risk {scan.riskScore ?? "?"}</span> : l ? <span className="text-xs text-warning">not checked yet</span> : <span className="text-xs text-subtle">—</span>}</td>
                <td className={td}>
                  <span className="flex flex-col gap-1">
                    {(r.status === "QUEUED" || r.status === "FAILED" || r.status === "SKIPPED") && <button type="submit" name="op" value={`import-one:${r.id}`} className={buttonClass("secondary", "sm")}>Import now</button>}
                    {(r.status === "FAILED" || r.status === "SKIPPED") && <button type="submit" name="op" value={`retry-one:${r.id}`} className={buttonClass("ghost", "sm")}>Queue again</button>}
                    {l && !scan && pendingRev && <button type="submit" name="op" value={`checks-one:${r.id}`} className={buttonClass("ghost", "sm")}>Run checks</button>}
                  </span>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </BulkForm>
      <Card>
        <h2 className="mb-2 font-semibold">Clean-up history</h2>
        <p className="mb-2 text-sm text-muted">The daily clean-up deletes duplicate and permanently failed queue entries after {s.num("cleanupRetentionDays") || 30} days. It never deletes listings, developer submissions, reviews or saved apps.</p>
        {cleanups.length === 0 ? <p className="text-sm text-subtle">Nothing has been cleaned up yet.</p> : (
          <ul className="space-y-1 text-sm">
            {cleanups.map((c) => {
              const m = (c.metadata ?? {}) as { deletedDuplicates?: number; deletedFailed?: number; deletedDeadJobs?: number; resetImporting?: number; duplicates?: Array<{ domain: string }>; failed?: Array<{ domain: string; category?: string }> };
              return (
                <li key={c.id}>
                  <details><summary className="cursor-pointer">{formatDate(c.createdAt)}: {m.deletedDuplicates ?? 0} duplicate(s), {m.deletedFailed ?? 0} failed import(s), {m.deletedDeadJobs ?? 0} failed job(s) deleted; {m.resetImporting ?? 0} stuck import(s) re-queued</summary>
                    <p className="mt-1 text-xs text-muted">Duplicates: {(m.duplicates ?? []).map((d) => d.domain).join(", ") || "—"}. Failed: {(m.failed ?? []).map((d) => `${d.domain} (${d.category ?? "error"})`).join(", ") || "—"}.</p>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
