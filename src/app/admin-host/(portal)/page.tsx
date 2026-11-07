import Link from "next/link";
import { LineChart, Stat } from "@/components/portal/charts";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { listingStats } from "@/server/analytics/stats";
import { daysAgo } from "@/lib/time";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const admin = await requireAdmin();
  const since = daysAgo(30);
  const [users, devs, published, pending, suspended, reports, alerts, recentAlerts, userGrowth] = await Promise.all([
    db.user.count({ where: { status: { not: "PENDING_DELETION" } } }),
    db.developerOrg.count(),
    db.listing.count({ where: { status: "PUBLISHED" } }),
    db.listingRevision.count({ where: { status: { in: ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"] } } }),
    db.listing.count({ where: { OR: [{ status: "SUSPENDED" }, { securityStatus: "RESTRICTED" }] } }),
    db.report.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.securityAlert.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    db.securityAlert.findMany({ where: { status: { in: ["OPEN", "INVESTIGATING"] } }, orderBy: { createdAt: "desc" }, take: 5, include: { listing: { select: { name: true } } } }),
    db.$queryRaw<Array<{ d: Date; n: bigint }>>`SELECT DATE(createdAt) d, COUNT(*) n FROM User WHERE createdAt >= ${since} GROUP BY 1 ORDER BY 1`,
  ]);
  const allIds = (await db.listing.findMany({ where: { status: "PUBLISHED" }, select: { id: true } })).map((l) => l.id);
  const stats = can(admin.role, "analytics.view") ? await listingStats(allIds, 30) : null;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Registered users" value={users} hint={`${userGrowth.reduce((a, r) => a + Number(r.n), 0)} new in 30 days`} />
        <Stat label="Developers" value={devs} />
        <Stat label="Published apps" value={published} />
        <Stat label="Pending submissions" value={pending} />
        <Stat label="Suspended / restricted" value={suspended} />
        <Stat label="Open reports" value={reports} />
        <Stat label="Open security alerts" value={alerts} />
        {stats && <Stat label="Views / outbound clicks (30 d)" value={`${stats.totals.views} / ${stats.totals.outboundClicks}`} />}
      </div>
      {stats && <div className="rounded-2xl border border-border bg-surface p-4"><LineChart title="Platform traffic (30 days)" points={stats.series as unknown as Array<Record<string, number | string>>} series={[{ key: "views", label: "Views", color: "#6366f1" }, { key: "outboundClicks", label: "Outbound clicks", color: "#0ea5e9" }]} /></div>}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">Recent security alerts</h2>
        {recentAlerts.length === 0 ? <p className="text-sm text-muted">No open alerts.</p> : (
          <ul className="space-y-2 text-sm">{recentAlerts.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2"><StatusPill status={a.severity} /><Link href={`/security/alerts/${a.id}`} className="font-medium text-brand hover:underline">{a.listing.name}</Link><span className="text-muted">{a.title}</span><span className="ml-auto text-xs text-subtle">{formatDate(a.createdAt)}</span></li>)}</ul>
        )}
      </section>
    </>
  );
}
