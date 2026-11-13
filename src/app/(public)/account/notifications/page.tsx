import Link from "next/link";
import { EmptyState } from "@/components/states";
import { PushToggle } from "@/components/push-toggle";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { markNotificationsReadAction } from "@/server/actions/user";

export default async function NotificationsPage() {
  const user = await requireUser("/account/notifications");
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Notifications</h1>
        {items.some((i) => !i.readAt) && <form action={markNotificationsReadAction}><button className={buttonClass("secondary", "sm")}>Mark all as read</button></form>}
      </div>
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-1 font-semibold">Push notifications</h2>
        <p className="mb-3 text-sm text-muted">Get Webcenta news and new apps on this phone or computer, even when Webcenta is closed.</p>
        <PushToggle />
      </section>
      {items.length === 0 ? <EmptyState title="No notifications">Replies to your reviews and updates to your listings appear here.</EmptyState> : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {items.map((n) => (
            <li key={n.id} className={cn("p-4", !n.readAt && "bg-brand-soft/40")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{!n.readAt && <span className="mr-2 inline-block size-2 rounded-full bg-brand" aria-label="Unread" />}{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-muted">{n.body}</p>}
                  {n.linkPath && <Link href={n.linkPath} className="mt-1 inline-block text-sm font-semibold text-brand hover:underline">Open</Link>}
                </div>
                <span className="shrink-0 text-xs text-subtle">{formatDate(n.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
