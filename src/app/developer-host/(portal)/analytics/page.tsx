import { AnalyticsView } from "@/components/portal/analytics-view";
import { DataTable, td } from "@/components/portal/table";
import { db } from "@/server/db";
import { requireDevPage } from "@/server/developer/context";
import { listingStats } from "@/server/analytics/stats";

export const metadata = { title: "Analytics" };

export default async function DevAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const ctx = await requireDevPage("ANALYST", "/analytics");
  const listings = await db.listing.findMany({ where: { developerId: ctx.org.id }, select: { id: true, name: true } });
  const stats = await listingStats(listings.map((l) => l.id), days);
  return (
    <>
      <AnalyticsView title="Analytics" stats={stats} days={days} basePath="/analytics" />
      <h2 className="text-lg font-bold">Most visited listings</h2>
      <DataTable head={["Listing", "Views", "Unique visitors (sum of daily)", "Outbound clicks", "CTR"]} empty={stats.perListing.length === 0}>
        {stats.perListing.sort((a, b) => b.views - a.views).map((p) => (
          <tr key={p.listingId}><td className={td}>{listings.find((l) => l.id === p.listingId)?.name}</td><td className={td}>{p.views}</td><td className={td}>{p.uniqueVisitors}</td><td className={td}>{p.outboundClicks}</td><td className={td}>{p.views ? ((p.outboundClicks / p.views) * 100).toFixed(1) : "0.0"}%</td></tr>
        ))}
      </DataTable>
    </>
  );
}
