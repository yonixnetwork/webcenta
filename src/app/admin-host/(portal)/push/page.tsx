import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { sendPushAction } from "@/server/actions/admin";

export const metadata = { title: "Push notifications" };

export default async function PushAdmin() {
  await requireAdmin("push.send");
  const [subscribers, signedIn, campaigns] = await Promise.all([
    db.pushSubscription.count({ where: { failureCount: { lt: 5 } } }),
    db.pushSubscription.count({ where: { failureCount: { lt: 5 }, userId: { not: null } } }),
    db.pushCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Push notifications</h1>
      <Card>
        <p className="text-sm text-muted">
          <strong className="text-text">{subscribers}</strong> device{subscribers === 1 ? "" : "s"} subscribed ({signedIn} signed in, {subscribers - signedIn} without an account).
          Notifications appear on the phone or computer even when Webcenta is closed. Visitors turn them on from the banner on the site or Account → Notifications.
          iPhone and iPad users must add Webcenta to the Home Screen first (iOS 16.4 or later).
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Send a notification</h2>
        <ActionForm action={sendPushAction} submitLabel="Send to all subscribed devices" pendingLabel="Sending…">
          <Field label="Title"><input name="title" required minLength={3} maxLength={120} className={inputClass} placeholder="New: 20 AI tools added" /></Field>
          <Field label="Message"><textarea name="body" required minLength={3} maxLength={400} rows={3} className={inputClass} /></Field>
          <Field label="Page to open" hint="A page on Webcenta, for example /c/ai or /app/notion. Leave empty for the homepage."><input name="url" maxLength={500} className={inputClass} placeholder="/" /></Field>
        </ActionForm>
      </Card>
      <DataTable head={["Sent", "Title", "Status", "Delivered", "Failed"]} empty={campaigns.length === 0}>
        {campaigns.map((c) => <tr key={c.id}><td className={td}>{formatDate(c.createdAt)}</td><td className={td}>{c.title}</td><td className={td}><StatusPill status={c.status} /></td><td className={td}>{c.delivered} / {c.recipients}</td><td className={td}>{c.failed}</td></tr>)}
      </DataTable>
    </>
  );
}
