import Link from "next/link";
import { StepUpCard } from "@/components/portal/step-up-card";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { externalProvidersConfigured } from "@/server/scanner/providers";
import { updateBlocklistAction, updatePolicyAction } from "@/server/actions/admin";
import { daysAgo } from "@/lib/time";

export const metadata = { title: "Security" };

export default async function SecurityAdmin() {
  await requireAdmin("security.manage");
  const [alerts, scans, policies, blocklist, failed] = await Promise.all([
    db.securityAlert.findMany({ where: { status: { in: ["OPEN", "INVESTIGATING"] } }, orderBy: [{ createdAt: "desc" }], include: { listing: { select: { name: true } } } }),
    db.securityScan.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { listing: { select: { name: true, id: true } } } }),
    db.monitoringPolicy.findMany(),
    db.systemSetting.findUnique({ where: { key: "security.domainBlocklist" } }),
    db.securityScan.count({ where: { status: "FAILED", createdAt: { gte: daysAgo(7) } } }),
  ]);
  const providers = await externalProvidersConfigured();
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Security monitoring</h1>
      <StepUpCard />
      <p className="text-sm text-muted">External threat-intelligence providers configured: <strong>{providers.length ? providers.join(", ") : "none"}</strong>. Without at least one, no submission can be auto-approved. {failed} scan(s) failed in the last 7 days.</p>
      <h2 className="text-lg font-bold">Open alerts <Link href="/security/alerts" className="ml-2 text-sm font-normal text-brand">all alerts →</Link></h2>
      <DataTable head={["Severity", "Listing", "Finding", "Status", "Auto-restricted", "Raised"]} empty={alerts.length === 0}>
        {alerts.map((a) => <tr key={a.id}><td className={td}><StatusPill status={a.severity} /></td><td className={td}><Link href={`/security/alerts/${a.id}`} className="font-semibold text-brand">{a.listing.name}</Link></td><td className={td}>{a.title}</td><td className={td}><StatusPill status={a.status} /></td><td className={td}>{a.autoRestricted ? "yes" : "no"}</td><td className={td}>{formatDate(a.createdAt)}</td></tr>)}
      </DataTable>
      <h2 className="text-lg font-bold">Monitoring policy</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {(["LOW", "MEDIUM", "HIGH", "PROHIBITED"] as const).map((tier) => {
          const p = policies.find((x) => x.riskTier === tier);
          return (
            <Card key={tier}>
              <h3 className="mb-2 font-semibold">{tier.toLowerCase()} risk</h3>
              <ActionForm action={updatePolicyAction.bind(null, tier)} submitLabel="Save" variant="secondary">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Re-scan every (hours)"><input name="scanIntervalHours" type="number" min={1} defaultValue={p?.scanIntervalHours ?? 168} className={inputClass} /></Field>
                  <Field label="Auto-restrict at severity"><select name="autoRestrictAtSeverity" defaultValue={p?.autoRestrictAtSeverity ?? "CRITICAL"} className={inputClass}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}</select></Field>
                </div>
                {tier === "LOW" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allowAutoApproval" defaultChecked={p?.allowAutoApproval} className="size-4 accent-[var(--brand)]" />Allow automatic approval when every check passes</label>}
              </ActionForm>
            </Card>
          );
        })}
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Domain blocklist</h2>
        <ActionForm action={updateBlocklistAction} submitLabel="Save blocklist" variant="secondary">
          <Field label="Known-bad domains (one per line). Listings on, or redirecting to, these domains fail the threat-intelligence check."><textarea name="domains" rows={5} defaultValue={((blocklist?.value as string[] | undefined) ?? []).join("\n")} className={`${inputClass} font-mono text-xs`} /></Field>
        </ActionForm>
      </Card>
      <h2 className="text-lg font-bold">Recent scans</h2>
      <DataTable head={["When", "Listing", "Trigger", "Result", "Risk", "Duration"]}>
        {scans.map((s) => <tr key={s.id}><td className={td}>{formatDate(s.createdAt)}</td><td className={td}><Link href={`/listings/${s.listing.id}`} className="text-brand">{s.listing.name}</Link></td><td className={td}>{s.trigger.toLowerCase()}</td><td className={td}><StatusPill status={s.overallVerdict ?? s.status} /></td><td className={td}>{s.riskScore ?? "—"}</td><td className={td}>{s.durationMs ? `${s.durationMs} ms` : s.error?.slice(0, 40) ?? "—"}</td></tr>)}
      </DataTable>
    </>
  );
}
