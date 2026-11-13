import Link from "next/link";
import { Check, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/states";
import { buttonClass } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { cn } from "@/components/ui/cn";
import { PushToggle } from "@/components/push-toggle";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { deleteNotificationAction, markNotificationReadAction, markNotificationsReadAction, notificationPrefsAction } from "@/server/actions/user";

export const metadata = { title: "Notifications", robots: { index: false } };

const PREFS = [
  ["notifyNewApps", "New apps in categories you are interested in"],
  ["notifySavedUpdates", "Updates to apps you saved"],
  ["notifyAnnouncements", "Webcenta news and announcements"],
  ["notifyReminders", "Reminders about new apps when you have not visited for a while"],
  ["pushNotifications", "Send these to my devices as push notifications too"],
  ["emailNotifications", "Also email me about replies and listing updates"],
] as const;

/** Relative time ("3 h ago") with the full date for screen readers and hover. */
function when(d: Date) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  const rel = s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86_400 ? `${Math.floor(s / 3600)} h ago` : s < 7 * 86_400 ? `${Math.floor(s / 86_400)} d ago` : formatDate(d);
  return <time dateTime={d.toISOString()} title={formatDate(d)}>{rel}</time>;
}

export default async function NotificationsPage() {
  const user = await requireUser("/account/notifications");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((i) => !i.readAt).length;
  const check = "size-4 accent-[var(--brand)]";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Notifications{unread > 0 && <span className="ml-2 align-middle text-sm font-semibold text-brand">{unread} unread</span>}</h1>
        {unread > 0 && <form action={markNotificationsReadAction}><button className={buttonClass("secondary", "sm")}>Mark all as read</button></form>}
      </div>
      {items.length === 0 ? <EmptyState title="No notifications yet">New apps you may like, updates to apps you saved and replies to your reviews appear here.</EmptyState> : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface" aria-label="Notifications">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 p-4", !n.readAt && "bg-brand-soft/40")}>
              <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
              <div className="min-w-0 flex-1">
                <p className="font-medium [overflow-wrap:anywhere]"><span className="sr-only">{n.readAt ? "Read: " : "Unread: "}</span>{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-muted [overflow-wrap:anywhere]">{n.body}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-subtle">
                  {when(n.createdAt)}
                  {n.linkPath && <Link href={n.linkPath} className="text-sm font-semibold text-brand hover:underline">Open</Link>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.readAt && <form action={markNotificationReadAction.bind(null, n.id)}><button title="Mark as read" aria-label={`Mark “${n.title}” as read`} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text"><Check className="size-4" aria-hidden /></button></form>}
                <form action={deleteNotificationAction.bind(null, n.id)}><button title="Delete" aria-label={`Delete “${n.title}”`} className="grid size-9 place-items-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="size-4" aria-hidden /></button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="push-title" className="rounded-2xl border border-border bg-surface p-4">
        <h2 id="push-title" className="mb-1 font-semibold">Push notifications on this device</h2>
        <p className="mb-3 text-sm text-muted">Stay updated with new applications, trending tools and discoveries, even when Webcenta is closed.</p>
        <PushToggle />
      </section>
      <section aria-labelledby="prefs-title" className="rounded-2xl border border-border bg-surface p-4">
        <h2 id="prefs-title" className="mb-3 font-semibold">What to notify me about</h2>
        <ActionForm action={notificationPrefsAction} submitLabel="Save preferences">
          <fieldset className="space-y-2">
            <legend className="sr-only">Notification preferences</legend>
            {PREFS.map(([k, label]) => (
              <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={user[k]} className={cn(check, "mt-0.5")} />{label}</label>
            ))}
          </fieldset>
          <p className="text-xs text-subtle">Important security notices about your account are always shown.</p>
        </ActionForm>
      </section>
    </>
  );
}
