import Link from "next/link";
import { StepUpCard } from "@/components/portal/step-up-card";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { externalProvidersConfigured } from "@/server/scanner/providers";
import { revokeAdminSessionsAction, updateBlocklistAction, updatePolicyAction } from "@/server/actions/admin";
import { InlineAction } from "@/components/portal/inline-action";
import { securityActivity } from "@/server/security/activity";
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
  const act = await securityActivity(24);
  const TYPE_LABEL: Record<string, string> = {
    "admin.login.failed": "Admin sign-in failures", "admin.login.locked": "Admin account lockouts", "admin.login.new-device": "Admin sign-ins from a new device",
    "admin.stepup.failed": "Wrong confirmation codes", "admin.permission.denied": "Admin permission denials", "user.login.failed": "User sign-in failures",
    "rate.limited": "Rate-limited sources", "cron.unauthorized": "Refused scheduler calls", "request.blocked": "Blocked requests", "import.suspicious": "Suspicious imports/submissions", "scan.failed": "Security scan failures",
  };
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Security monitoring</h1>
      <StepUpCard />
      <p className="text-sm text-muted">External threat-intelligence providers configured: <strong>{providers.length ? providers.join(", ") : "none"}</strong>. Without at least one, no submission can be auto-approved. {failed} scan(s) failed in the last 7 days.</p>
      <h2 className="text-lg font-bold" id="activity">Account and request security (last {act.hours} hours)</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="security-activity">
        <li className="rounded-xl border border-border p-3 text-sm"><span className="text-xs text-subtle">Failed admin sign-ins</span><br /><strong className="text-lg">{act.adminFailed}</strong></li>
        <li className="rounded-xl border border-border p-3 text-sm"><span className="text-xs text-subtle">Failed user sign-ins</span><br /><strong className="text-lg">{act.userFailed}</strong></li>
        <li className="rounded-xl border border-border p-3 text-sm"><span className="text-xs text-subtle">Locked admin accounts now</span><br /><strong className="text-lg">{act.lockedAdmins.length}</strong>{act.lockedAdmins.map((l) => <span key={l.id} className="block text-xs text-muted">{l.email} until {l.lockedUntil?.toISOString().slice(11, 16)} UTC</span>)}</li>
        <li className="rounded-xl border border-border p-3 text-sm"><span className="text-xs text-subtle">Active admin sessions</span><br /><strong className="text-lg">{act.sessions.length}</strong></li>
      </ul>
      <DataTable head={["Activity", "Events", "Sources"]} empty={act.byType.length === 0}>
        {act.byType.map((t) => <tr key={t.type}><td className={td}>{TYPE_LABEL[t.type] ?? t.type}</td><td className={td}>{t.events}</td><td className={td}>{t.sources}</td></tr>)}
      </DataTable>
      {act.recent.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-semibold">Recent warnings ({act.recent.length})</summary>
          <DataTable head={["Last seen", "Severity", "Activity", "Source", "Count", "Detail", "Alerted"]}>
            {act.recent.map((e) => <tr key={e.id}><td className={td}>{formatDate(e.lastAt)}</td><td className={td}><StatusPill status={e.severity.toUpperCase()} /></td><td className={td}>{TYPE_LABEL[e.type] ?? e.type}</td><td className={`${td} font-mono text-xs break-all`}>{e.source}</td><td className={td}>{e.count}</td><td className={`${td} max-w-xs text-xs break-words`}>{e.detail}</td><td className={td}>{e.alertedAt ? "emailed" : "—"}</td></tr>)}
          </DataTable>
        </details>
      )}
      <h3 className="font-semibold">Active administrator sessions</h3>
      <DataTable head={["Administrator", "Signed in", "Last active", "Address", "Browser", ""]} empty={act.sessions.length === 0}>
        {act.sessions.map((s) => <tr key={s.id}><td className={td}>{s.admin.email}</td><td className={td}>{formatDate(s.createdAt)}</td><td className={td}>{formatDate(s.lastSeenAt)}</td><td className={`${td} font-mono text-xs`}>{s.ipAddress ?? "—"}</td><td className={`${td} max-w-xs truncate text-xs`}>{s.userAgent}</td><td className={td}><InlineAction action={revokeAdminSessionsAction.bind(null, s.adminId)} label="Revoke all their sessions" confirmText={`Sign ${s.admin.email} out everywhere?`} /></td></tr>)}
      </DataTable>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card><h3 className="mb-2 font-semibold">Configuration changes</h3>{act.configChanges.length ? <ul className="space-y-1 text-sm">{act.configChanges.map((c) => <li key={c.id}>{formatDate(c.createdAt)} · {c.action}{c.targetId ? ` · ${c.targetId}` : ""}</li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Card>
        <Card><h3 className="mb-2 font-semibold">Sensitive administrator actions</h3>{act.sensitive.length ? <ul className="space-y-1 text-sm">{act.sensitive.map((c) => <li key={c.id}>{formatDate(c.createdAt)} · {c.action}</li>)}</ul> : <p className="text-sm text-muted">None.</p>}</Card>
      </div>
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
