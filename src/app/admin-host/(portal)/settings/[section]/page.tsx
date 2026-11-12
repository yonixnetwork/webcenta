import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/form";
import { SettingsForm, TestButton, type SettingsFieldView } from "@/components/portal/settings-form";
import { SettingsStatusPill } from "@/components/portal/settings-status";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { applyMigrationsAction, saveSettingsAction, testSettingsAction } from "@/server/actions/settings";
import { migrationStatus } from "@/server/setup/migrate";
import { databaseStatus } from "@/server/settings/database";
import { sectionById } from "@/server/settings/registry";
import { originsFromEnv } from "@/lib/hosts";
import { getSection, publicView, statusOf } from "@/server/settings/store";

const APPLY = {
  immediate: "Changes take effect within a few seconds on every server process. No restart needed.",
  restart: "Changes take effect after restarting the application (hPanel → Node.js → Restart).",
  redeploy: "Changes need a redeploy of the application.",
} as const;

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  return { title: `${sectionById((await params).section)?.title ?? "Settings"} · Settings` };
}

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const admin = await requireAdmin("settings.manage");
  const def = sectionById((await params).section);
  if (!def || def.paid) notFound();
  const canEdit = can(admin.role, def.permission);
  const section = await getSection(def.id);
  const status = statusOf(section.r);
  const pub = new Map(publicView(section).map((p) => [p.key, p]));
  const fields: SettingsFieldView[] = def.fields.map((f) => {
    const p = pub.get(f.key)!;
    return {
      key: f.key, label: f.label, help: f.help, type: f.type, required: f.required, env: f.env,
      defaultValue: f.default === undefined ? undefined : String(f.default), options: f.options, min: f.min, max: f.max,
      placeholder: f.placeholder, when: f.when, multiline: f.multiline, saved: p.saved, effective: p.effective, secretSet: p.secretSet, source: p.source,
    };
  });

  return (
    <>
      <p className="text-sm"><Link href="/settings" className="text-brand hover:underline">← Settings</Link> <span className="text-subtle">/ {def.group}</span></p>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{def.title}</h1>
        {!def.statusOnly && <SettingsStatusPill status={status.status} />}
      </div>
      <p className="text-sm text-muted">{def.description}</p>

      {def.warning && <p role="note" className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">{def.warning}</p>}

      <Card className="space-y-2 text-sm">
        <p><strong>Used by:</strong> {def.usedBy}</p>
        <p><strong>When changes apply:</strong> {APPLY[def.apply]}{def.applyNote ? ` ${def.applyNote}` : ""}</p>
        {def.provider && (
          <p><strong>Credentials from:</strong> <a href={def.provider.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{def.provider.name}</a>{def.provider.cost ? ` — ${def.provider.cost}` : ""}</p>
        )}
        {!def.statusOnly && <p><strong>Status:</strong> {status.detail}{status.test ? ` (tested ${formatDate(new Date(status.test.at))})` : ""}</p>}
        {!canEdit && <p className="text-subtle">View only: changing this section requires the Super Administrator role.</p>}
      </Card>

      {def.callbackPath && <CallbackUrls def={def} />}

      {def.id === "database" && <DatabaseStatus canMigrate={can(admin.role, "integrations.manage")} />}
      {def.id === "jobs" && <QueueHealth />}

      {!def.statusOnly && (
        <Card>
          <SettingsForm action={saveSettingsAction.bind(null, def.id)} fields={fields} toggle={Boolean(def.toggle)} enabled={section.enabled} readOnly={!canEdit} sectionTitle={def.title} />
        </Card>
      )}

      {def.testable && canEdit && (
        <Card className="space-y-2">
          <h2 className="font-semibold">Test connection</h2>
          <p className="text-sm text-muted">{def.testNote} The test uses the saved settings: save your changes first.</p>
          <TestButton action={testSettingsAction.bind(null, def.id)} />
        </Card>
      )}
    </>
  );
}

/** The exact URLs to register with an OAuth provider, for both sites that offer sign-in. */
function CallbackUrls({ def }: { def: { id: string; callbackPath?: string } }) {
  const o = originsFromEnv();
  const urls = [
    { site: "Marketplace (webcenta.com)", origin: o.publicOrigin },
    { site: "Developer portal (developers.)", origin: o.developerOrigin },
  ];
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">Authorised callback URLs</h2>
      <p className="text-muted">Register these exact URLs with the provider{def.id === "apple" ? " (Services ID → Return URLs), and add both domains under Domains and Subdomains" : ""}.</p>
      <ul className="space-y-1">
        {urls.map((u) => (
          <li key={u.site} className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-56 shrink-0 text-subtle">{u.site}</span>
            <code className="select-all break-all rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs">{u.origin}{def.callbackPath}</code>
          </li>
        ))}
      </ul>
      {def.id === "apple" && <p className="text-subtle">Domains: <code className="select-all">{new URL(o.publicOrigin).host}</code>, <code className="select-all">{new URL(o.developerOrigin).host}</code></p>}
      {def.id === "google" && <p className="text-subtle">Authorised JavaScript origins: <code className="select-all">{o.publicOrigin}</code>, <code className="select-all">{o.developerOrigin}</code></p>}
    </Card>
  );
}

async function DatabaseStatus({ canMigrate }: { canMigrate: boolean }) {
  const s = await databaseStatus();
  const m = await migrationStatus().catch(() => null);
  const pending = m?.migrations.filter((x) => x.state === "pending").map((x) => x.name) ?? [];
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">Connection</h2>
      {s.ok ? (
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[200px_1fr]">
          <dt className="text-muted">Status</dt><dd className="text-success">Connected ({s.latencyMs} ms)</dd>
          <dt className="text-muted">Server</dt><dd>{s.version}</dd>
          <dt className="text-muted">Database</dt><dd><code className="break-all">{s.target}</code></dd>
          <dt className="text-muted">Size</dt><dd>{s.tables} tables, {s.sizeMb} MB</dd>
          <dt className="text-muted">Session time zone</dt><dd>{s.timeZone}</dd>
          <dt className="text-muted">Migrations</dt><dd>{s.applied} applied{s.latest ? `, latest ${s.latest}` : ""}{s.failed.length ? <span className="text-danger"> — failed: {s.failed.join(", ")}</span> : ""}</dd>
          <dt className="text-muted">Connections per process</dt><dd>{s.poolMax} (DATABASE_POOL_MAX)</dd>
        </dl>
      ) : (
        <p role="alert" className="text-danger">Not connected to <code>{s.target}</code>: {s.error}</p>
      )}
      {pending.length > 0 && (
        <div className="space-y-2 rounded-xl bg-warning-soft p-3 text-warning">
          <p>{pending.length} migration(s) not yet applied: {pending.join(", ")}. The new version of the application needs them. Take a backup first (hPanel → Databases → Backups).</p>
          {canMigrate ? <TestButton action={applyMigrationsAction} label="Apply pending migrations" pendingLabel="Applying…" /> : <p>A Super Administrator can apply them here.</p>}
        </div>
      )}
      <p className="text-subtle">To change the database, update DATABASE_URL in hPanel → Node.js → Environment variables and redeploy. For a full compatibility check run <code>npm run db:check</code> on the server.</p>
    </Card>
  );
}

async function queueHealth(now: number) {
  const since = new Date(now - 24 * 3600_000);
  const [pending, failed, dead, lastRun] = await Promise.all([
    db.job.count({ where: { status: "PENDING" } }),
    db.job.count({ where: { status: "FAILED", createdAt: { gte: since } } }),
    db.job.count({ where: { status: "DEAD" } }),
    db.jobRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, runner: true } }),
  ]);
  return { pending, failed, dead, lastRun, stale: !lastRun || now - lastRun.startedAt.getTime() > 15 * 60_000 };
}

async function QueueHealth() {
  const { pending, failed, dead, lastRun, stale } = await queueHealth(new Date().getTime());
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">Queue health</h2>
      <p>Last run: {lastRun ? `${formatDate(lastRun.startedAt)} (${lastRun.runner})` : "never"}{stale && <span className="text-warning"> — no run in the last 15 minutes: check the cron job in hPanel.</span>}</p>
      <p>{pending} pending · {failed} failed (queued in the last 24 h) · {dead} needing attention. Details in <Link href="/jobs" className="text-brand hover:underline">Jobs & email</Link>.</p>
      <p className="text-subtle">Hostinger cron command (every 5 minutes): <code className="break-all">curl -fsS -X POST -H &quot;Authorization: Bearer &lt;cron secret&gt;&quot; {(process.env.PUBLIC_ORIGIN || "https://webcenta.com").replace(/\/$/, "")}/api/cron/tick</code></p>
    </Card>
  );
}
