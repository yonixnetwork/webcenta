import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";
import { isSafeRelativePath } from "@/lib/url";

/** Creates an in-app notification and, if the user allows it, an email. */
export async function notify(userId: string, n: { type: NotificationType; title: string; body?: string; linkPath?: string; email?: boolean }) {
  const linkPath = n.linkPath && isSafeRelativePath(n.linkPath) ? n.linkPath : null;
  const notification = await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body ?? null, linkPath } });
  if (n.email !== false) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailNotifications: true, status: true } });
    if (user && user.emailNotifications && user.status === "ACTIVE") {
      const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
      const m = actionEmail({ title: n.title, intro: n.body ?? n.title, actionLabel: "Open WebCenter", url: `${origin}${linkPath ?? "/account/notifications"}`,
        outro: "You can turn off email notifications in Account → Privacy & data." });
      await sendEmail({ to: user.email, subject: n.title, template: `notification:${n.type}`, ...m });
    }
  }
  return notification;
}

/** Notifies every member of a developer organisation. */
export async function notifyOrg(orgId: string, n: Parameters<typeof notify>[1]) {
  const members = await db.developerMember.findMany({ where: { orgId }, select: { userId: true } });
  for (const m of members) await notify(m.userId, n);
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
