import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { requireAdmin } from "@/server/admin/auth";
import { db } from "@/server/db";
import { getSection } from "@/server/settings/store";
import { AD_POLICY_CATEGORIES } from "@/server/ads/content-policy";
import { resolveAdReportAction } from "@/server/actions/international";
import { AD_REPORT_REASONS } from "@/lib/ad-report";
import { formatDate } from "@/lib/labels";

export const metadata = { title: "Ad reports & policy" };

const REASON = Object.fromEntries(AD_REPORT_REASONS) as Record<string, string>;

/**
 * Admin → Ad reports & policy: what visitors reported, the brand-safety checklist for the
 * provider dashboards, and quick links to switch off a placement or provider.
 */
export default async function AdReportsAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("monetization.manage");
  const status = (await searchParams).status === "closed" ? "closed" : "open";
  const [reports, policy, ads, adsterra, adsense, counts] = await Promise.all([
    db.adReport.findMany({ where: status === "open" ? { status: "open" } : { status: { in: ["resolved", "dismissed"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    getSection("adPolicy"), getSection("ads"), getSection("adsterra"), getSection("adsense"),
    db.adReport.groupBy({ by: ["placement"], where: { status: "open" }, _count: { _all: true } }),
  ]);
  const blocked = AD_POLICY_CATEGORIES.filter((c) => policy.bool(c.key));
  const advertisers = policy.str("blockedAdvertisers").split(/\s+/).filter(Boolean);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Ad reports &amp; policy</h1>
      <Card>
        <h2 className="mb-2 font-semibold">Brand-safety checklist</h2>
        <p className="mb-2 text-sm text-muted">
          Ads are chosen by the provider and shown in sandboxed frames that Webcenta cannot inspect. Webcenta enforces what it controls (no ads on
          pages about blocked categories or 18+ apps, country and provider switches, placement limits, consent). The categories below must also be
          blocked in each provider&apos;s dashboard — that is what decides which creatives are served.
        </p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{blocked.map((c) => <li key={c.key}>✓ Block: {c.label}</li>)}</ul>
        <ul className="mt-3 space-y-1 text-sm">
          <li><strong>AdSense</strong> ({adsense.enabled ? "configured" : "off"}): Blocking controls → Content → Sensitive categories and General categories; Advertiser URLs ({advertisers.length} listed). Last checked: <strong>{policy.str("adsenseConfirmedAt") || "never"}</strong></li>
          <li><strong>Adsterra</strong> ({adsterra.enabled ? "on" : "off"}): ask your account manager / support to apply these category blocks for the website, and send the blocked advertiser list; banner and native units only. Last checked: <strong>{policy.str("adsterraConfirmedAt") || "never"}</strong></li>
        </ul>
        <p className="mt-3 text-sm"><Link href="/settings/adPolicy" className="text-brand underline">Edit the ad content policy</Link> · <Link href="/settings/ads" className="text-brand underline">Switch placements off</Link> · <Link href="/settings/adsterra" className="text-brand underline">Turn Adsterra off</Link> · <Link href="/countries" className="text-brand underline">Country policies</Link></p>
        <p className="mt-1 text-xs text-subtle">Ads are {ads.enabled ? "on" : "off"} site-wide.</p>
      </Card>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Reports from visitors</h2>
          <div className="flex gap-3 text-sm"><Link href="/ad-reports" aria-current={status === "open" ? "page" : undefined} className="aria-[current=page]:font-bold">Open</Link><Link href="/ad-reports?status=closed" aria-current={status === "closed" ? "page" : undefined} className="aria-[current=page]:font-bold">Closed</Link></div>
        </div>
        {counts.length > 0 && <p className="mb-2 text-xs text-subtle">Open reports by placement: {counts.map((c) => `${c.placement} ${c._count._all}`).join(", ")}</p>}
        <DataTable head={["When", "Placement", "Reason", "Details", "Status"]} empty={!reports.length}>
          {reports.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className={`${td} text-xs`}>{formatDate(r.createdAt)}<br />{r.country ?? "country unknown"}</td>
              <td className={`${td} text-xs`}>{r.placement}<br /><span className="text-subtle">{r.provider}</span><br /><span className="text-subtle">{r.pagePath}</span></td>
              <td className={td}>{REASON[r.reason] ?? r.reason}</td>
              <td className={`${td} max-w-sm whitespace-pre-line text-xs`}>{r.details ?? ""}</td>
              <td className={td}>
                <StatusPill status={r.status.toUpperCase()} />
                {r.status === "open" ? (
                  <ActionForm action={resolveAdReportAction.bind(null, r.id)} submitLabel="Close" variant="secondary" className="mt-2">
                    <Field label="Outcome"><select name="status" className={inputClass} defaultValue="resolved"><option value="resolved">Resolved (blocked / changed)</option><option value="dismissed">Dismissed (no problem found)</option></select></Field>
                    <Field label="What was done"><input name="resolution" required minLength={3} maxLength={500} className={inputClass} /></Field>
                  </ActionForm>
                ) : <p className="mt-1 text-xs text-muted">{r.resolution}</p>}
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
