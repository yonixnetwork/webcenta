import Link from "next/link";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Support" };

export default async function SupportAdmin() {
  await requireAdmin("support.manage");
  const cases = await db.supportCase.findMany({ orderBy: { updatedAt: "desc" }, take: 200, include: { _count: { select: { messages: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Support cases</h1>
      <DataTable head={["Subject", "From", "Status", "Messages", "Updated"]} empty={cases.length === 0}>
        {cases.map((c) => <tr key={c.id}><td className={td}><Link href={`/support/${c.id}`} className="font-semibold text-brand">{c.subject}</Link></td><td className={td}>{c.contactEmail}</td><td className={td}><StatusPill status={c.status} /></td><td className={td}>{c._count.messages}</td><td className={td}>{formatDate(c.updatedAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
