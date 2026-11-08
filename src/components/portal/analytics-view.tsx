import Link from "next/link";
import { BarList, LineChart, Stat } from "./charts";
import type { listingStats } from "@/server/analytics/stats";
import { cn } from "@/components/ui/cn";

export function AnalyticsView({ title, stats, days, basePath }: { title: string; stats: Awaited<ReturnType<typeof listingStats>>; days: number; basePath: string }) {
  const t = stats.totals;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <nav aria-label="Period" className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
          {[7, 30, 90].map((d) => <Link key={d} href={`${basePath}?days=${d}`} aria-current={d === days ? "true" : undefined} className={cn("rounded-lg px-3 py-1", d === days ? "bg-surface font-semibold shadow-card" : "text-muted")}>{d} days</Link>)}
        </nav>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Listing views" value={t.views} />
        <Stat label="Unique visitors" value={t.uniqueVisitors} hint="Sum of daily uniques" />
        <Stat label="Outbound clicks" value={t.outboundClicks} hint={`${t.uniqueOutboundClicks} unique (daily)`} />
        <Stat label="Click-through rate" value={`${(stats.ctr * 100).toFixed(1)}%`} />
        <Stat label="Search impressions" value={t.searchImpressions} />
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <LineChart title="Daily performance" points={stats.series as unknown as Array<Record<string, number | string>>} series={[{ key: "views", label: "Views", color: "#6366f1" }, { key: "outboundClicks", label: "Outbound clicks", color: "#0ea5e9" }, { key: "uniqueVisitors", label: "Unique visitors", color: "#10b981" }]} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Countries" rows={stats.countries.map((c) => ({ key: c.key, value: c.views, secondary: c.outboundClicks }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Devices" rows={stats.devices.map((c) => ({ key: c.key.toLowerCase(), value: c.views, secondary: c.outboundClicks }))} /></div>
        <div className="rounded-2xl border border-border bg-surface p-4"><BarList title="Referral sources" rows={stats.referrers.map((c) => ({ key: c.key, value: c.views, secondary: c.outboundClicks }))} /></div>
      </div>
      <p className="text-xs text-muted">
        Outbound clicks count visitors who chose “Visit website” on Webcenta. Webcenta cannot see what happens on your website,
        so registrations, purchases and other conversions are not measured. Figures are updated about every 15 minutes, exclude
        detected bots, count repeat visits within 30 minutes once, and group countries/devices with fewer than 5 visits to protect privacy.
      </p>
    </div>
  );
}
