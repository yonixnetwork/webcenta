import Link from "next/link";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("listings.moderate");
  const { status } = await searchParams;
  const statuses = status === "all" ? undefined : status ? [status] : ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"];
  const revs = await db.listingRevision.findMany({
    where: statuses ? { status: { in: statuses as never } } : {}, orderBy: { submittedAt: "asc" }, take: 200,
    include: { listing: { select: { name: true, source: true, riskTier: true, publishedAt: true, developer: { select: { displayName: true } } } }, scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Submissions</h1>
      <nav className="flex flex-wrap gap-2 text-sm">{[["", "Needs review"], ["INFO_REQUIRED", "Info requested"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["all", "All"]].map(([v, l]) => <Link key={v} href={v ? `/submissions?status=${v}` : "/submissions"} className={(status ?? "") === v ? "font-semibold text-brand" : "text-muted hover:text-text"}>{l}</Link>)}</nav>
      <DataTable head={["App", "Type", "Developer", "Risk", "Checks", "Status", "Submitted"]} empty={revs.length === 0}>
        {revs.map((r) => (
          <tr key={r.id}>
            <td className={td}><Link href={`/submissions/${r.id}`} className="font-semibold text-brand hover:underline">{(r.data as { name?: string }).name ?? r.listing.name}</Link></td>
            <td className={td}>{r.listing.publishedAt ? `Update #${r.revisionNumber}` : r.listing.source === "EDITORIAL" ? "Editorial" : "New"}</td>
            <td className={td}>{r.listing.developer?.displayName ?? "WebCenter editors"}</td>
            <td className={td}><StatusPill status={r.listing.riskTier} /></td>
            <td className={td}>{r.scans[0] ? <StatusPill status={r.scans[0].overallVerdict ?? r.scans[0].status} /> : "—"}</td>
            <td className={td}><StatusPill status={r.status} /></td>
            <td className={td}>{formatDate(r.submittedAt)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
