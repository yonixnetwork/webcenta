import Link from "next/link";
import { BarList, LineChart, Stat } from "@/components/portal/charts";
import { cn } from "@/components/ui/cn";
import { requireAdmin } from "@/server/admin/auth";
import { platformStats } from "@/server/analytics/stats";

export const metadata = { title: "Analytics" };

export default async function AnalyticsAdmin({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin("analytics.view");
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const s = await platformStats(days);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Platform analytics</h1>
        <nav className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">{[7, 30, 90].map((d) => <Link key={d} href={`/analytics?days=${d}`} className={cn("rounded-lg px-3 py-1", d === days ? "bg-surface font-semibold" : "text-muted")}>{d} days</Link>)}</nav>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listing views" value={s.totals.views} /><Stat label="Unique visitors" value={s.totals.uniqueVisitors} hint="Sum of daily uniques" />
        <Stat label="Outbound clicks" value={s.totals.outboundClicks} /><Stat label="CTR" value={`${(s.ctr * 100).toFixed(1)}%`} />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4"><LineChart title="Traffic" points={s.series as unknown as Array<Record<string, number | string>>} series={[{ key: "views", label: "Views", color: "#6366f1" }, { key: "outboundClicks", label: "Outbound clicks", color: "#0ea5e9" }]} /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Popular categories" rows={s.topCategories.map((c) => ({ key: c.name, value: c.views, secondary: c.clicks }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Popular applications" rows={s.topListings.map((l) => ({ key: l.name, value: l.views, secondary: l.outboundClicks }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Countries" rows={s.countries.map((c) => ({ key: c.key, value: c.views }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Devices" rows={s.devices.map((c) => ({ key: c.key.toLowerCase(), value: c.views }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Search trends" valueLabel="Searches" rows={s.topSearches.map((q) => ({ key: q.query, value: q.count }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Searches with no results" valueLabel="Searches" rows={s.zeroResultSearches.map((q) => ({ key: q.query, value: q.count }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="User growth (sign-ups per day)" valueLabel="Users" rows={s.userGrowth.map((g) => ({ key: g.date, value: g.count }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Developer growth" valueLabel="Organisations" rows={s.developerGrowth.map((g) => ({ key: g.date, value: g.count }))} /></div>
      </div>
    </>
  );
}
