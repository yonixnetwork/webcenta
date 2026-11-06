import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Users" };

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin("users.view");
  const { q, status } = await searchParams;
  const users = await db.user.findMany({
    where: { ...(q ? { OR: [{ email: { contains: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }] } : {}), ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { reviews: true, reportsAgainst: true } } },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Users</h1>
      <form className="flex flex-wrap gap-2"><input name="q" defaultValue={q} placeholder="Email or name" className={`${inputClass} max-w-xs`} /><select name="status" defaultValue={status ?? ""} className={`${inputClass} w-auto`}><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="PENDING_DELETION">Pending deletion</option></select><button className={buttonClass("secondary", "md")}>Search</button></form>
      <DataTable head={["Name", "Email", "Verified", "Status", "Reviews", "Reports against", "Joined"]} empty={users.length === 0}>
        {users.map((u) => <tr key={u.id}><td className={td}><Link href={`/users/${u.id}`} className="font-semibold text-brand">{u.name}</Link></td><td className={td}>{u.email}</td><td className={td}>{u.emailVerified ? "yes" : "no"}</td><td className={td}><StatusPill status={u.status} /></td><td className={td}>{u._count.reviews}</td><td className={td}>{u._count.reportsAgainst}</td><td className={td}>{formatDate(u.createdAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
