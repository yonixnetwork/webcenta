import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";

export default async function MyReportsPage() {
  const user = await requireUser("/account/reports");
  const reports = await db.report.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: "desc" }, include: { listing: { select: { name: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">My reports</h1>
      {reports.length === 0 ? <EmptyState title="You have not reported anything" /> : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 p-4 text-sm">
              <span className="font-medium">{r.targetType === "LISTING" ? r.listing?.name ?? "Listing" : r.targetType.toLowerCase()}</span>
              <span className="text-muted">· {r.reason.replace(/_/g, " ").toLowerCase()}</span>
              <Badge tone={r.status.startsWith("RESOLVED") ? "success" : r.status === "DISMISSED" ? "neutral" : "warning"}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
              <span className="ml-auto text-xs text-subtle">{formatDate(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
