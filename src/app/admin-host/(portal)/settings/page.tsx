import Link from "next/link";
import { Card } from "@/components/ui/form";
import { SettingsStatusPill } from "@/components/portal/settings-status";
import { requireAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { GROUPS } from "@/server/settings/registry";
import { allSections, settingsDbError } from "@/server/settings/store";
import { startupStatus } from "@/server/settings/startup";

export const metadata = { title: "Settings" };

export default async function SettingsIndex() {
  const admin = await requireAdmin("settings.manage");
  const [sections, dbError] = await Promise.all([allSections(), settingsDbError()]);
  const startup = startupStatus();
  const isProd = process.env.NODE_ENV === "production";
  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">System configuration</h1>
        <p className="mt-1 text-sm text-muted">Configure integrations and site behaviour without editing code. Changes take effect within seconds unless a section says otherwise. Credentials are encrypted in the database and never shown again after saving.</p>
      </div>
      {process.env.SETUP_TOKEN && <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">First-time setup is finished: remove <code>SETUP_TOKEN</code> from the hosting environment (the setup page is already closed because an owner account exists).</p>}
      {dbError && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Settings could not be read from the database ({dbError}). Environment values and defaults are in use.</p>}
      {GROUPS.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`} className="space-y-3">
          <h2 id={`g-${g}`} className="text-lg font-bold">{g}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {sections.filter((s) => s.section.r.def.group === g).map(({ section, status }) => {
              const d = section.r.def;
              return (
                <Link key={d.id} href={`/settings/${d.id}`} className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-brand">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{d.title}</h3>
                    {d.statusOnly ? <span className="text-xs text-subtle">Status</span> : <SettingsStatusPill status={status.status} />}
                  </div>
                  <p className="mt-1 text-sm text-muted">{d.description}</p>
                  {!d.statusOnly && (status.status === "missing" || status.status === "error") && <p className="mt-2 text-xs text-subtle">{status.detail}</p>}
                  {d.permission === "integrations.manage" && !can(admin.role, "integrations.manage") && <p className="mt-2 text-xs text-subtle">View only: Super Administrators can change this.</p>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">System and deployment</h2>
        <Link href="/settings/system" className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-brand">
          <h3 className="font-semibold">Configuration inventory</h3>
          <p className="mt-1 text-sm text-muted">Every environment variable: purpose, required or optional, secret, startup or dashboard-managed, restart or redeploy, and whether it is set here.</p>
        </Link>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Content</h2>
        <Link href="/settings/content" className="block rounded-2xl border border-border bg-surface p-4 shadow-card transition hover:border-brand">
          <h3 className="font-semibold">Ranking, announcements & legal</h3>
          <p className="mt-1 text-sm text-muted">Organic ranking weights, announcements to users and developers, and the legal policies.</p>
        </Link>
      </section>
      <Card>
        <h2 className="font-semibold">Hosting environment (set in hPanel, not here)</h2>
        <p className="mt-1 text-sm text-muted">The application needs these before it can connect to the database, so they cannot be edited from the dashboard. Change them in hPanel → Websites → Node.js → Environment variables, then restart the app. Only whether each is set is shown.</p>
        <ul className="mt-3 divide-y divide-border text-sm">
          {startup.map((v) => {
            const needed = v.required === "always" || (v.required === "production" && isProd);
            return (
              <li key={v.name} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                <code className="w-48 shrink-0 font-semibold">{v.name}</code>
                <span className={v.set ? "text-success" : needed ? "text-danger" : "text-subtle"}>{v.set ? "Set" : needed ? "Missing" : "Not set (optional)"}</span>
                <span className="basis-full text-xs text-subtle sm:basis-auto sm:flex-1">{v.purpose}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
