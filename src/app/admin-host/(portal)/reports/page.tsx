import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { InlineAction } from "@/components/portal/inline-action";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { resolveReportAction, scanNowAction } from "@/server/actions/admin";

export const metadata = { title: "Reports" };

export default async function ReportsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; listing?: string; type?: string }> }) {
  await requireAdmin("content.moderate");
  const sp = await searchParams;
  const reports = await db.report.findMany({
    where: { ...(sp.status === "all" ? {} : { status: { in: sp.status ? [sp.status as never] : ["OPEN", "IN_REVIEW"] } }), ...(sp.listing ? { listingId: sp.listing } : {}), ...(sp.type ? { targetType: sp.type as never } : {}) },
    orderBy: { createdAt: "asc" }, take: 100,
    include: { listing: { select: { id: true, name: true, slug: true, status: true } }, review: { select: { id: true, body: true, rating: true, status: true, listing: { select: { name: true } } } }, reporter: { select: { email: true } } },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
      <nav className="flex flex-wrap gap-3 text-sm">{[["", "Open"], ["all", "All"]].map(([v, l]) => <Link key={v} href={v ? `/reports?status=${v}` : "/reports"} className={(sp.status ?? "") === v ? "font-semibold text-brand" : "text-muted"}>{l}</Link>)}<Link href="/reports?type=LISTING" className="text-muted">Listings</Link><Link href="/reports?type=REVIEW" className="text-muted">Reviews</Link></nav>
      {reports.length === 0 ? <p className="text-sm text-muted">No reports.</p> : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4" data-report={r.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusPill status={r.status} /><strong>{r.reason.replace(/_/g, " ").toLowerCase()}</strong>
                <span className="text-muted">· {r.targetType.toLowerCase()} · {r.reporter?.email ?? "anonymous"} · {formatDate(r.createdAt)}</span>
              </div>
              {r.listing && <p className="mt-1 text-sm">Listing: <Link href={`/listings/${r.listing.id}`} className="font-semibold text-brand">{r.listing.name}</Link> ({r.listing.status.toLowerCase()})</p>}
              {r.review && <p className="mt-1 text-sm">Review on {r.review.listing.name} ({r.review.rating}★, {r.review.status.toLowerCase()}): “{r.review.body?.slice(0, 200)}” — <Link href={`/reviews?id=${r.review.id}`} className="text-brand">moderate</Link></p>}
              {r.details && <p className="mt-1 rounded-lg bg-surface-2 p-2 text-sm">{r.details}</p>}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {r.listing && ["SCAM_OR_FRAUD", "PHISHING", "MALWARE", "SUSPICIOUS_REDIRECT", "IMPERSONATION"].includes(r.reason) && <InlineAction action={scanNowAction.bind(null, r.listing.id)} label="Run security scan" />}
                <ActionForm action={resolveReportAction.bind(null, r.id)} submitLabel="Update report" variant="secondary" className="flex flex-wrap items-end gap-2 space-y-0">
                  <Field label="Status"><select name="status" className={inputClass}><option value="IN_REVIEW">In review</option><option value="RESOLVED_ACTION_TAKEN">Resolved – action taken</option><option value="RESOLVED_NO_ACTION">Resolved – no action</option><option value="DISMISSED">Dismissed</option></select></Field>
                  <Field label="Notes"><input name="notes" className={inputClass} /></Field>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
