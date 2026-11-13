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

export const metadata = { title: "Push notifications" };

const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);
const KIND_LABEL: Record<string, string> = { CAMPAIGN: "Announcement", EVENT: "Notification", REMINDER: "Reminder" };

export default async function PushAdmin({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireAdmin("push.send");
  const kind = (await searchParams).kind;
  const since = weekAgo();
  const [subscribers, signedIn, log, week, cfg] = await Promise.all([
    db.pushSubscription.count({ where: { failureCount: { lt: 5 } } }),
    db.pushSubscription.count({ where: { failureCount: { lt: 5 }, userId: { not: null } } }),
    db.pushCampaign.findMany({ where: kind && KIND_LABEL[kind] ? { kind } : {}, orderBy: { createdAt: "desc" }, take: 100 }),
    db.pushCampaign.groupBy({ by: ["kind"], where: { createdAt: { gte: since } }, _sum: { delivered: true, failed: true }, _count: { _all: true } }),
    getSection("engagement"),
  ]);
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
