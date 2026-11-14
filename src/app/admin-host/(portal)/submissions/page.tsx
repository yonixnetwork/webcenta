import Link from "next/link";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { SubmissionsBulkForm } from "@/components/portal/submissions-bulk-form";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { approvalEligibility } from "@/server/listings/bulk-moderation";
import { bulkSubmissionsAction } from "@/server/actions/admin";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("listings.moderate");
  const { status } = await searchParams;
  const statuses = status === "all" ? undefined : status ? [status] : ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"];
  const revs = await db.listingRevision.findMany({
    where: statuses ? { status: { in: statuses as never } } : {}, orderBy: { submittedAt: "asc" }, take: 200,
    include: { listing: { select: { name: true, source: true, riskTier: true, publishedAt: true, developer: { select: { displayName: true } } } }, scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const elig = new Map((await approvalEligibility(revs.map((r) => r.id))).map((e) => [e.revisionId, e]));
  const eligibleCount = [...elig.values()].filter((e) => e.eligible).length;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Submissions</h1>
      <nav className="flex flex-wrap gap-2 text-sm">{[["", "Needs review"], ["INFO_REQUIRED", "Info requested"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["all", "All"]].map(([v, l]) => <Link key={v} href={v ? `/submissions?status=${v}` : "/submissions"} className={(status ?? "") === v ? "font-semibold text-brand" : "text-muted hover:text-text"}>{l}</Link>)}</nav>
      <SubmissionsBulkForm action={bulkSubmissionsAction} eligible={eligibleCount}>
        <DataTable head={["", "App", "Type", "Developer", "Risk", "Checks", "Status", "Bulk approval", "Submitted"]} empty={revs.length === 0}>
          {revs.map((r) => {
            const e = elig.get(r.id);
            const name = (r.data as { name?: string }).name ?? r.listing.name;
            return (
              <tr key={r.id}>
                <td className={td}><input type="checkbox" name="ids" value={r.id} aria-label={`Select ${name}`} data-eligible={e?.eligible ? "1" : undefined} className="size-4" /></td>
                <td className={td}><Link href={`/submissions/${r.id}`} className="font-semibold text-brand hover:underline">{name}</Link>{r.changeSummary && <p className="max-w-64 text-xs text-muted">“{r.changeSummary}”</p>}</td>
                <td className={td}>{r.listing.publishedAt ? `Update #${r.revisionNumber}` : r.listing.source === "EDITORIAL" ? "Editorial" : "New"}</td>
                <td className={td}>{r.listing.developer?.displayName ?? "Webcenta editors"}</td>
                <td className={td}><StatusPill status={r.listing.riskTier} /></td>
                <td className={td}>{r.scans[0] ? <StatusPill status={r.scans[0].overallVerdict ?? r.scans[0].status} /> : "—"}</td>
                <td className={td}><StatusPill status={r.status} /></td>
                <td className={`${td} max-w-56 text-xs`}>{e?.eligible ? <span className="font-semibold text-success">Eligible</span> : <span className="text-muted">{e?.reason ?? "—"}</span>}</td>
                <td className={td}>{formatDate(r.submittedAt)}</td>
              </tr>
            );
          })}
        </DataTable>
      </SubmissionsBulkForm>
    </>
  );
}
