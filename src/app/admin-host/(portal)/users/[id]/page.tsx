import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { setUserStatusAction } from "@/server/actions/admin";

export default async function UserAdmin({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin("users.view");
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, include: {
    reviews: { orderBy: { createdAt: "desc" }, take: 20, include: { listing: { select: { name: true } } } },
    authEvents: { orderBy: { createdAt: "desc" }, take: 20 }, developerMembers: { include: { org: true } },
    reportsFiled: { orderBy: { createdAt: "desc" }, take: 10 }, reportsAgainst: { orderBy: { createdAt: "desc" }, take: 10 },
  } });
  if (!u) notFound();
  return (
    <>
      <Link href="/users" className="text-sm text-muted hover:text-text">← Users</Link>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight">{u.name}</h1><StatusPill status={u.status} /></div>
      <p className="text-sm text-muted">{u.email} · email {u.emailVerified ? "verified" : "unverified"} · joined {formatDate(u.createdAt)}{u.suspendReason ? ` · suspended: ${u.suspendReason}` : ""}</p>
      {u.developerMembers.length > 0 && <p className="text-sm">Developer member of: {u.developerMembers.map((m) => <Link key={m.orgId} href={`/developers/${m.orgId}`} className="mr-2 text-brand">{m.org.displayName} ({m.role.toLowerCase()})</Link>)}</p>}
      {can(admin.role, "users.suspend") && (
        <Card>
          {u.status === "SUSPENDED" ? <ActionForm action={setUserStatusAction.bind(null, u.id, "ACTIVE")} submitLabel="Reinstate user" /> : (
            <ActionForm action={setUserStatusAction.bind(null, u.id, "SUSPENDED")} submitLabel="Suspend user and sign out" variant="secondary"><Field label="Reason (recorded)"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
          )}
        </Card>
      )}
      <h2 className="text-lg font-bold">Reviews</h2>
      <DataTable head={["Listing", "Rating", "Status", "Signals", "Date"]} empty={u.reviews.length === 0}>
        {u.reviews.map((r) => <tr key={r.id}><td className={td}>{r.listing.name}</td><td className={td}>{r.rating}★</td><td className={td}><StatusPill status={r.status} /></td><td className={td}>{Array.isArray(r.abuseSignals) ? (r.abuseSignals as string[]).join(", ") : ""}</td><td className={td}>{formatDate(r.createdAt)}</td></tr>)}
      </DataTable>
      <h2 className="text-lg font-bold">Sign-in history</h2>
      <DataTable head={["Event", "IP", "Device", "Date"]} empty={u.authEvents.length === 0}>
        {u.authEvents.map((e) => <tr key={e.id}><td className={td}>{e.type.toLowerCase()}</td><td className={td}>{e.ipAddress ?? "—"}</td><td className={td}>{e.userAgent?.slice(0, 50) ?? "—"}</td><td className={td}>{formatDate(e.createdAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
