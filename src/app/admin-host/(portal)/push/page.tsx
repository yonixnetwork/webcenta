import Link from "next/link";
import { Bell } from "lucide-react";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { sendPushAction } from "@/server/actions/admin";
import { getSection } from "@/server/settings/store";
import { pushDiagnostics } from "@/server/push/diagnostics";

export const metadata = { title: "Push notifications" };

const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);
const KIND_LABEL: Record<string, string> = { CAMPAIGN: "Announcement", EVENT: "Notification", REMINDER: "Reminder" };

export default async function PushAdmin({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAdmin("push.send");
  const kind = (await searchParams).kind;
  const since = weekAgo();
  const [subscribers, signedIn, log, week, cfg, d] = await Promise.all([
    db.pushSubscription.count({ where: { failureCount: { lt: 5 } } }),
    db.pushSubscription.count({ where: { failureCount: { lt: 5 }, userId: { not: null } } }),
    db.pushCampaign.findMany({ where: kind && KIND_LABEL[kind] ? { kind } : {}, orderBy: { createdAt: "desc" }, take: 100 }),
    db.pushCampaign.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _sum: { delivered: true, failed: true }, _count: { _all: true } }),
    getSection("engagement"),
    pushDiagnostics(7),
  ]);
  const stat = (label: string, value: string | number, hint?: string) => <li className="rounded-xl border border-border p-3 text-sm"><span className="text-xs text-subtle">{label}</span><br /><strong className="text-lg">{value}</strong>{hint && <><br /><span className="text-xs text-muted">{hint}</span></>}</li>;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Push notifications</h1>
      <Card>
        <p className="text-sm text-muted">
          <strong className="text-text">{subscribers}</strong> device{subscribers === 1 ? "" : "s"} subscribed ({signedIn} signed in, {subscribers - signedIn} without an account).
          Notifications appear on the phone or computer even when Webcenta is closed, and announcements also appear in signed-in users&apos; notification centre.
          Users who turned announcements or push off are skipped. iPhone and iPad users must add Webcenta to the Home Screen first (iOS 16.4 or later).
        </p>
        <p className="mt-2 text-sm text-muted">Automatic events, limits and reminder wording: <Link href="/settings/engagement" className="text-brand underline">Settings → Push notifications &amp; reminders</Link>.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {(["CAMPAIGN", "EVENT", "REMINDER"] as const).map((k) => {
            const w = week.find((x) => x.kind === k);
            return <li key={k} className="rounded-xl border border-border p-3 text-sm"><strong>{KIND_LABEL[k]}s, last 7 days</strong><br />{w?._count._all ?? 0} sent · {w?._sum.delivered ?? 0} accepted · {w?._sum.failed ?? 0} failed</li>;
          })}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Delivery report (last {d.days} days)</h2>
        <p className="mb-3 text-xs text-subtle">Push attempts are counted per device. &ldquo;Accepted&rdquo; is the push service&apos;s answer (HTTP 201): Webcenta cannot see whether a phone displayed the notification or the user saw it.</p>
        <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="push-diagnostics">
          {stat("In-app notifications created", d.notificationsCreated)}
          {stat("Push attempts", d.attempts)}
          {stat("Accepted by push services", d.accepted)}
          {stat("Failed attempts", d.failed)}
          {stat("Expired subscriptions removed", d.expired)}
          {stat("Signed-in users without push", `${d.usersWithoutPush} of ${d.activeUsers}`, "No device has turned on notifications")}
          {stat("Devices not eligible", d.notEligible, `${d.unhealthy} failing repeatedly · ${d.optedOut} opted out`)}
          {stat("Last accepted delivery", d.lastAcceptedAt ? formatDate(d.lastAcceptedAt) : "never", d.lastAttemptAt ? `Last attempt ${formatDate(d.lastAttemptAt)}` : undefined)}
        </ul>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="font-semibold">Error categories</p>{d.categories.length ? <ul className="text-muted">{d.categories.map((c) => <li key={c.category}>{c.category}: {c.count}</li>)}</ul> : <p className="text-muted">No failures.</p>}</div>
          <div><p className="font-semibold">By device type</p>{d.platforms.length ? <ul className="text-muted">{d.platforms.map((p) => <li key={p.platform}>{p.platform}: {p.accepted} accepted · {p.failed} failed · {p.expired} expired</li>)}</ul> : <p className="text-muted">No attempts yet.</p>}</div>
          <div><p className="font-semibold">Subscribed devices</p><ul className="text-muted">{d.subscriptionsByPlatform.map((p) => <li key={p.platform}>{p.platform}: {p.count}</li>)}<li>iPhone/iPad Home Screen apps: {d.iosStandalone}</li></ul></div>
        </div>
        {d.recentFailures.length > 0 && (
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Recent failing devices ({d.recentFailures.length})</summary>
            <DataTable head={["Device", "Account", "Last failure", "Error", "Failures", "Last accepted", "Last confirmed by browser"]}>
              {d.recentFailures.map((f) => <tr key={f.id}><td className={td}>{f.platform ?? "?"}{f.standalone ? " (installed)" : ""}</td><td className={td}>{f.userId ? "signed in" : "no account"}</td><td className={td}>{formatDate(f.lastFailureAt)}</td><td className={`${td} max-w-xs text-xs break-words`}>{f.lastError}</td><td className={td}>{f.failureCount}</td><td className={td}>{formatDate(f.lastSuccessAt)}</td><td className={td}>{formatDate(f.lastSyncedAt)}</td></tr>)}
            </DataTable>
          </details>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Send an announcement</h2>
        {!cfg.bool("campaigns") ? <p className="text-sm text-warning">Announcements are turned off in Settings.</p> : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <ActionForm action={sendPushAction} submitLabel="Send to all subscribed devices" pendingLabel="Sending…">
              <Field label="Title"><input name="title" required minLength={3} maxLength={120} className={inputClass} placeholder="New: 20 AI tools added" /></Field>
              <Field label="Message"><textarea name="body" required minLength={3} maxLength={400} rows={3} className={inputClass} /></Field>
              <Field label="Page to open" hint="A page on Webcenta, for example /c/ai or /app/notion. Leave empty for the homepage."><input name="url" maxLength={500} className={inputClass} placeholder="/" /></Field>
            </ActionForm>
            <div aria-label="Preview" className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Preview (appearance varies by device)</p>
              <div className="flex gap-3 rounded-2xl border border-border bg-surface-2 p-3 shadow-card">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-contrast"><Bell className="size-5" aria-hidden /></span>
                <div className="min-w-0 text-sm"><p className="font-semibold">Webcenta · Title</p><p className="text-muted">Your message appears here, followed by the page it opens.</p></div>
              </div>
            </div>
          </div>
        )}
      </Card>
      <nav aria-label="Filter log" className="flex flex-wrap gap-2 text-sm">
        <Link href="/push" className="rounded-full border border-border px-3 py-1">All</Link>
        {Object.entries(KIND_LABEL).map(([k, l]) => <Link key={k} href={`/push?kind=${k}`} className="rounded-full border border-border px-3 py-1">{l}s</Link>)}
      </nav>
      <p className="text-xs text-subtle">&ldquo;Accepted&rdquo; means the browser&apos;s push service accepted the message; it does not prove the device displayed it.</p>
      <DataTable head={["Sent", "Type", "Title", "Status", "Accepted", "Failed"]} empty={log.length === 0}>
        {log.map((c) => <tr key={c.id}><td className={td}>{formatDate(c.createdAt)}</td><td className={td}>{KIND_LABEL[c.kind] ?? c.kind}</td><td className={td}>{c.title}</td><td className={td}><StatusPill status={c.status} /></td><td className={td}>{c.delivered} / {c.recipients}</td><td className={td}>{c.failed}</td></tr>)}
      </DataTable>
    </>
  );
}
