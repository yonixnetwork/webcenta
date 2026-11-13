import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";
import { isSafeRelativePath } from "@/lib/url";
import { getSection } from "@/server/settings/store";

/**
 * Creates an in-app notification and, if the user and the site settings allow it, an email and a
 * push to the user's devices. Every push a user receives is therefore also in their notification
 * centre. `push: false` keeps it in-app only.
 */
export async function notify(userId: string, n: { type: NotificationType; title: string; body?: string; linkPath?: string; email?: boolean; push?: boolean }) {
  const linkPath = n.linkPath && isSafeRelativePath(n.linkPath) ? n.linkPath : null;
  const notification = await db.notification.create({ data: { userId, type: n.type, title: n.title, body: n.body ?? null, linkPath } });
  if (n.push !== false) await pushToUser(userId, { type: n.type, title: n.title, body: n.body ?? "", url: linkPath ?? "/account/notifications" }).catch(() => undefined);
  if (n.email !== false && (await getSection("notifications")).bool("emailUserNotifications")) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailNotifications: true, status: true } });
    if (user && user.emailNotifications && user.status === "ACTIVE") {
      const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
      const m = actionEmail({ title: n.title, intro: n.body ?? n.title, actionLabel: "Open Webcenta", url: `${origin}${linkPath ?? "/account/notifications"}`,
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

/** Pushes to the user's subscribed devices, within the daily limit (security notices always go). */
async function pushToUser(userId: string, m: { type: NotificationType; title: string; body: string; url: string }) {
  const cfg = await getSection("engagement");
  if (!cfg.bool("pushEvents")) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { pushNotifications: true, status: true } });
  if (!user || user.status !== "ACTIVE" || !user.pushNotifications) return;
  const subs = await db.pushSubscription.findMany({ where: { userId, failureCount: { lt: 5 } }, select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true, platform: true } });
  if (!subs.length) return;
  if (m.type !== "SECURITY_NOTICE") {
    const today = await db.pushCampaign.count({ where: { userId, kind: { in: ["EVENT", "REMINDER"] }, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= Math.max(1, cfg.num("maxPushPerDay") || 3)) return;
  }
  const { sendBatch } = await import("@/server/push/push");
  const kind = m.type === "REMINDER" ? "REMINDER" : "EVENT";
  const r = await sendBatch(subs, { title: m.title, body: m.body, url: m.url }, { kind, userId });
  // Delivery log (Admin → Push notifications): accepted by the push service, not proof of display.
  await db.pushCampaign.create({ data: { kind, userId, title: m.title.slice(0, 120), body: (m.body || m.title).slice(0, 400), url: m.url.slice(0, 500), status: "SENT", recipients: subs.length, delivered: r.delivered, failed: r.failed, completedAt: new Date() } });
}

/** Template with {placeholders}. */
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/**
 * A newly published app: users interested in its category hear about it, at most one such
 * notification per user per day.
 */
export async function notifyNewApp(listingId: string, limit = 500): Promise<number> {
  const cfg = await getSection("engagement");
  if (!cfg.bool("newAppAlerts")) return 0;
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { name: true, slug: true, tagline: true, status: true, primaryCategory: { select: { id: true, name: true, parentId: true, defaultAgeRating: true } } } });
  if (!l || l.status !== "PUBLISHED" || !l.primaryCategory) return 0;
  const catIds = [l.primaryCategory.id, l.primaryCategory.parentId].filter((x): x is string => Boolean(x));
  const since = new Date(Date.now() - 86_400_000);
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE", notifyNewApps: true, personalizationEnabled: true,
      interests: { some: { categoryId: { in: catIds }, weight: { gte: 1 } } },
      notifications: { none: { type: "NEW_APP", createdAt: { gte: since } } },
    },
    select: { id: true, maxAgeRating: true }, take: limit,
  });
  const order = ["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"];
  const title = fill(cfg.str("newAppTitle") || "New in {category}: {app}", { app: l.name, category: l.primaryCategory.name });
  let n = 0;
  for (const u of users) {
    if (order.indexOf(l.primaryCategory.defaultAgeRating) > order.indexOf(u.maxAgeRating)) continue;
    await notify(u.id, { type: "NEW_APP", title, body: l.tagline ?? undefined, linkPath: `/app/${l.slug}`, email: false });
    n++;
  }
  return n;
}

/** A saved app was updated: tell the users who saved it (at most once a week per app). */
export async function notifySavedAppUpdated(listingId: string, limit = 1000): Promise<number> {
  const cfg = await getSection("engagement");
  if (!cfg.bool("savedUpdateAlerts")) return 0;
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { name: true, slug: true, status: true } });
  if (!l || l.status !== "PUBLISHED") return 0;
  const path = `/app/${l.slug}`;
  const since = new Date(Date.now() - 7 * 86_400_000);
  const users = await db.user.findMany({
    where: { status: "ACTIVE", notifySavedUpdates: true, favorites: { some: { listingId } }, notifications: { none: { type: "APP_UPDATE", linkPath: path, createdAt: { gte: since } } } },
    select: { id: true }, take: limit,
  });
  for (const u of users) await notify(u.id, { type: "APP_UPDATE", title: `${l.name} was updated`, body: "An app you saved has new details on Webcenta.", linkPath: path, email: false });
  return users.length;
}

/**
 * "New apps since your last visit": only for users with push turned on who have not visited for
 * `reminderDays`, at most once per `reminderEveryDays`, never twice without a visit in between,
 * and only when new apps were really published since their last visit.
 */
export async function sendInactivityReminders(now = new Date(), limit = 200): Promise<number> {
  const cfg = await getSection("engagement");
  if (!cfg.bool("reminders")) return 0;
  const days = Math.max(2, cfg.num("reminderDays") || 2);
  const every = Math.max(7, cfg.num("reminderEveryDays") || 7);
  const seenBefore = new Date(now.getTime() - days * 86_400_000);
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE", notifyReminders: true, pushNotifications: true,
      lastSeenAt: { lte: seenBefore, gte: new Date(now.getTime() - 90 * 86_400_000) },
      pushSubscriptions: { some: { failureCount: { lt: 5 } } },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: new Date(now.getTime() - every * 86_400_000) } }],
    },
    select: { id: true, lastSeenAt: true, lastReminderAt: true }, take: limit,
  });
  let sent = 0;
  for (const u of users) {
    if (u.lastReminderAt && u.lastSeenAt && u.lastReminderAt > u.lastSeenAt) continue; // no visit since the last reminder
    const fresh = await db.listing.count({ where: { status: "PUBLISHED", deletedAt: null, publishedAt: { gt: u.lastSeenAt ?? seenBefore } } });
    if (!fresh) continue;
    await db.user.update({ where: { id: u.id }, data: { lastReminderAt: now } });
    await notify(u.id, {
      type: "REMINDER", title: cfg.str("reminderTitle") || "New on Webcenta",
      body: fill(cfg.str("reminderBody") || "New applications have been added to Webcenta. Come and discover what's new.", { count: String(fresh) }),
      linkPath: "/search?sort=newest", email: false,
    });
    sent++;
  }
  return sent;
}
