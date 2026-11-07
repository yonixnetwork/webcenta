import Link from "next/link";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export default async function AlertsList({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  await requireAdmin("security.manage");
  const { listing } = await searchParams;
  const alerts = await db.securityAlert.findMany({ where: listing ? { listingId: listing } : {}, orderBy: { createdAt: "desc" }, take: 200, include: { listing: { select: { name: true } } } });
  return (
    <>
      <Link href="/security" className="text-sm text-muted hover:text-text">← Security</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Security alerts</h1>
      <DataTable head={["Severity", "Listing", "Finding", "Status", "Raised", "Resolved"]} empty={alerts.length === 0}>
        {alerts.map((a) => <tr key={a.id}><td className={td}><StatusPill status={a.severity} /></td><td className={td}><Link href={`/security/alerts/${a.id}`} className="text-brand">{a.listing.name}</Link></td><td className={td}>{a.title}</td><td className={td}><StatusPill status={a.status} /></td><td className={td}>{formatDate(a.createdAt)}</td><td className={td}>{formatDate(a.resolvedAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
