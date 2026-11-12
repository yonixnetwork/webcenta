import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalyticsView } from "@/components/portal/analytics-view";
import { db } from "@/server/db";
import { requireDevPage } from "@/server/developer/context";
import { listingStats } from "@/server/analytics/stats";

export default async function ListingAnalyticsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ days?: string }> }) {
  const { id } = await params;
  const days = [7, 30, 90].includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const ctx = await requireDevPage("ANALYST", `/listings/${id}/analytics`);
  const l = await db.listing.findFirst({ where: { id, developerId: ctx.org.id } });
  if (!l) notFound();
  return (
    <>
      <Link href={`/listings/${id}`} className="text-sm text-muted hover:text-text">← {l.name}</Link>
      <AnalyticsView title={`Analytics · ${l.name}`} stats={await listingStats([id], days)} days={days} basePath={`/listings/${id}/analytics`} />
    </>
  );
}
