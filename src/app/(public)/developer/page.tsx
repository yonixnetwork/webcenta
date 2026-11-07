import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { Stat } from "@/components/portal/charts";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { getDevContext } from "@/server/developer/context";
import { listingStats } from "@/server/analytics/stats";
import { createOrgAction } from "@/server/actions/developer";

export default async function DeveloperHome() {
  const ctx = await getDevContext("/developer");
  if (!ctx) {
    return (
      <div className="space-y-6 py-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Webcenta for Developers</h1>
          <p className="mt-2 text-muted">Create a developer organisation to submit apps, verify your domains, reply to reviews and see analytics. Listing is free; every submission is reviewed before it appears.</p>
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Create your developer organisation</h2>
          <ActionForm action={createOrgAction} submitLabel="Create organisation">
            <Field label="Organisation or developer name"><input name="displayName" required minLength={2} maxLength={80} className={inputClass} /></Field>
            <Field label="Website (optional)"><input name="websiteUrl" type="url" className={inputClass} /></Field>
            <Field label="Public contact email (optional)"><input name="contactEmail" type="email" className={inputClass} /></Field>
            <Field label="Country (ISO code, optional)"><input name="countryCode" maxLength={2} className={`${inputClass} uppercase`} /></Field>
          </ActionForm>
        </Card>
      </div>
    );
  }
  const listings = await db.listing.findMany({
    where: { developerId: ctx.org.id }, orderBy: { updatedAt: "desc" },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 }, _count: { select: { reviews: true } } },
  });
  const stats = await listingStats(listings.map((l) => l.id), 30);
  const verified = await db.domainVerification.count({ where: { orgId: ctx.org.id, status: "VERIFIED" } });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Overview</h1>
        <Link href="/developer/listings/new" className={buttonClass("primary", "md")}>Submit an app</Link>
      </div>
      {verified === 0 && <p className="rounded-xl bg-brand-soft p-3 text-sm text-brand">Start by <Link href="/developer/domains" className="font-semibold underline">verifying your domain</Link>. Submissions require proof that you control the website.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listings" value={listings.length} hint={`${listings.filter((l) => l.status === "PUBLISHED").length} published`} />
        <Stat label="Views (30 days)" value={stats.totals.views} />
        <Stat label="Outbound clicks (30 days)" value={stats.totals.outboundClicks} hint="Clicks on “Visit website”, not sign-ups" />
        <Stat label="Click-through rate" value={`${(stats.ctr * 100).toFixed(1)}%`} />
      </div>
      <DataTable head={["App", "Status", "Latest revision", "Security", "Reviews", "Updated"]} empty={listings.length === 0}>
        {listings.map((l) => (
          <tr key={l.id}>
            <td className={td}><Link href={`/developer/listings/${l.id}`} className="font-semibold text-brand hover:underline">{l.name}</Link></td>
            <td className={td}><StatusPill status={l.status} /></td>
            <td className={td}>{l.revisions[0] ? <>#{l.revisions[0].revisionNumber} <StatusPill status={l.revisions[0].status} /></> : "—"}</td>
            <td className={td}><StatusPill status={l.securityStatus} /></td>
            <td className={td}>{l._count.reviews}</td>
            <td className={td}>{formatDate(l.updatedAt)}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
