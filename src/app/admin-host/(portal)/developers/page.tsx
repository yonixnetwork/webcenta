import Link from "next/link";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Developers" };

export default async function DevelopersAdmin() {
  await requireAdmin("developers.verify");
  const orgs = await db.developerOrg.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { _count: { select: { listings: true, members: true, complianceDocs: true } } } });
  const pendingDocs = await db.complianceDocument.count({ where: { decision: "PENDING" } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Developers</h1>
      {pendingDocs > 0 && <p className="text-sm text-warning">{pendingDocs} compliance document(s) awaiting review.</p>}
      <DataTable head={["Organisation", "Verification", "Status", "Listings", "Members", "Docs", "Created"]} empty={orgs.length === 0}>
        {orgs.map((o) => <tr key={o.id}><td className={td}><Link href={`/developers/${o.id}`} className="font-semibold text-brand">{o.displayName}</Link></td><td className={td}><StatusPill status={o.verificationLevel} /></td><td className={td}><StatusPill status={o.status} /></td><td className={td}>{o._count.listings}</td><td className={td}>{o._count.members}</td><td className={td}>{o._count.complianceDocs}</td><td className={td}>{formatDate(o.createdAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
