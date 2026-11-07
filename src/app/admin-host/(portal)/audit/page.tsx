import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { DataTable, td } from "@/components/portal/table";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; target?: string; before?: string }> }) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const rows = await db.auditLog.findMany({
    where: { ...(sp.action ? { action: { startsWith: sp.action } } : {}), ...(sp.target ? { targetId: sp.target } : {}), ...(sp.before ? { id: { lt: BigInt(sp.before) } } : {}) },
    orderBy: { id: "desc" }, take: 100, include: { admin: { select: { email: true } } },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Audit log</h1>
      <p className="text-sm text-muted">Append-only record of administrative and security-relevant actions.</p>
      <form className="flex flex-wrap gap-2"><input name="action" defaultValue={sp.action} placeholder="Action prefix, e.g. listing." className={`${inputClass} max-w-xs`} /><input name="target" defaultValue={sp.target} placeholder="Target id" className={`${inputClass} max-w-xs`} /><button className={buttonClass("secondary", "md")}>Filter</button></form>
      <DataTable head={["When (UTC)", "Actor", "Action", "Target", "Details"]} empty={rows.length === 0}>
        {rows.map((r) => <tr key={String(r.id)}><td className={`${td} whitespace-nowrap`}>{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td><td className={td}>{r.admin?.email ?? `${r.actorType.toLowerCase()}${r.actorUserId ? ` ${r.actorUserId.slice(0, 8)}` : ""}`}</td><td className={td}><code className="text-xs">{r.action}</code></td><td className={td}>{r.targetType ? `${r.targetType} ${r.targetId?.slice(0, 8) ?? ""}` : "—"}</td><td className={`${td} max-w-xs truncate text-xs text-muted`}>{r.metadata ? JSON.stringify(r.metadata) : ""}</td></tr>)}
      </DataTable>
      {rows.length === 100 && <Link href={`/audit?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), before: String(rows[rows.length - 1]!.id) })}`} className="text-sm font-semibold text-brand">Older →</Link>}
    </>
  );
}
