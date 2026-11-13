import { createHash } from "node:crypto";
import webpush from "web-push";
import { db } from "@/server/db";
import { openSecret, sealSecret } from "@/server/settings/keys";
import { getSection } from "@/server/settings/store";

/**
 * Web push (the standard Push API, VAPID). Works in Chrome, Edge, Firefox and Samsung Internet on
 * Android and desktop, Safari on macOS, and on iPhone/iPad (iOS 16.4+) once Webcenta is added to
 * the Home Screen. Visitors do not need an account: a subscription belongs to the browser.
 * The VAPID key pair is generated on first use and stored encrypted in SystemSetting.
 */
const VAPID_KEY = "push.vapid";
const AAD = "push.vapid.privateKey";

interface Vapid { publicKey: string; privateKey: string }
let cached: Vapid | null = null;

export async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  const row = await db.systemSetting.findUnique({ where: { key: VAPID_KEY } });
  const v = row?.value as { publicKey?: string; privateKey?: string } | null;
  if (v?.publicKey && v.privateKey) {
    cached = { publicKey: v.publicKey, privateKey: openSecret(v.privateKey, AAD) };
    return cached;
  }
  const k = webpush.generateVAPIDKeys();
  // create (not upsert): if another process created keys at the same moment, use theirs.
  try {
    await db.systemSetting.create({ data: { key: VAPID_KEY, value: { publicKey: k.publicKey, privateKey: sealSecret(k.privateKey, AAD) }, description: "Web push VAPID keys (private key encrypted)" } });
    cached = k;
    return k;
  } catch {
    cached = null;
    return vapidKeys();
  }
}

export const endpointHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

export interface SubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

/** Only real push services (https) are accepted, so the server never posts to an arbitrary address. */
export function validSubscription(s: unknown): s is SubscriptionInput {
  const x = s as SubscriptionInput;
  if (!x || typeof x.endpoint !== "string" || x.endpoint.length > 2000 || !x.keys || typeof x.keys.p256dh !== "string" || typeof x.keys.auth !== "string") return false;
  if (x.keys.p256dh.length > 255 || x.keys.auth.length > 255) return false;
  try {
    const u = new URL(x.endpoint);
    return u.protocol === "https:" && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com)$/.test(u.hostname);
  } catch { return false; }
}

export async function saveSubscription(s: SubscriptionInput, userId: string | null, userAgent: string | null) {
  const hash = endpointHash(s.endpoint);
  await db.pushSubscription.upsert({
    where: { endpointHash: hash },
    create: { endpointHash: hash, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, userId, userAgent: userAgent?.slice(0, 255) ?? null },
    update: { p256dh: s.keys.p256dh, auth: s.keys.auth, failureCount: 0, ...(userId ? { userId } : {}) },
  });
}

export async function removeSubscription(endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpointHash: endpointHash(endpoint) } });
}

async function subject(): Promise<string> {
  const from = (await getSection("email")).str("from");
  const email = /<([^>]+)>/.exec(from)?.[1] ?? (from.includes("@") ? from : "");
  return email ? `mailto:${email}` : (process.env.PUBLIC_ORIGIN ?? "https://webcenta.com");
}

export interface PushMessage { title: string; body: string; url: string }

/** Sends one message to a batch of subscriptions; removes subscriptions the push service says are gone. */
export async function sendBatch(subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>, msg: PushMessage) {
  const keys = await vapidKeys();
  const subj = await subject();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, icon: "/icons/icon-192.png", badge: "/icons/favicon-48.png" });
  let delivered = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails: { subject: subj, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600, timeout: 10_000 });
      delivered++;
      await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      else await db.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 } } }).catch(() => undefined);
    }
  }));
  return { delivered, failed };
}

const BATCH = 100;

/** Sends the next batch of a campaign; returns true when the campaign is finished. */
export async function runCampaignBatch(campaignId: string): Promise<boolean> {
  const c = await db.pushCampaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status === "SENT" || c.status === "FAILED") return true;
  if (c.status === "QUEUED") {
    const recipients = await db.pushSubscription.count({ where: { failureCount: { lt: 5 }, OR: [{ userId: null }, { user: { status: "ACTIVE", notifyAnnouncements: true, pushNotifications: true } }] } });
    await db.pushCampaign.update({ where: { id: c.id }, data: { status: "SENDING", recipients } });
  }
  // Browsers without an account opted in through the browser; signed-in users also need their
  // announcement and push preferences on.
  const subs = await db.pushSubscription.findMany({
    where: { failureCount: { lt: 5 }, ...(c.cursor ? { id: { gt: c.cursor } } : {}), OR: [{ userId: null }, { user: { status: "ACTIVE", notifyAnnouncements: true, pushNotifications: true } }] },
    orderBy: { id: "asc" }, take: BATCH, select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true },
  });
  if (!subs.length) {
    await db.pushCampaign.update({ where: { id: c.id }, data: { status: "SENT", completedAt: new Date() } });
    return true;
  }
  const r = await sendBatch(subs, { title: c.title, body: c.body, url: c.url });
  // The same announcement in each signed-in recipient's notification centre (once per user).
  const users = [...new Set(subs.map((s) => s.userId).filter((u): u is string => Boolean(u)))];
  for (const userId of users) {
    const exists = await db.notification.findFirst({ where: { userId, type: "ANNOUNCEMENT", data: { equals: { campaignId: c.id } } }, select: { id: true } });
    if (!exists) await db.notification.create({ data: { userId, type: "ANNOUNCEMENT", title: c.title, body: c.body, linkPath: c.url, data: { campaignId: c.id } } });
  }
  await db.pushCampaign.update({ where: { id: c.id }, data: { cursor: subs[subs.length - 1]!.id, delivered: { increment: r.delivered }, failed: { increment: r.failed } } });
  return false;
}

/** Cron: continue every campaign that is still sending, within a time budget. */
export async function continueCampaigns(budgetMs = 15_000) {
  const until = Date.now() + budgetMs;
  const open = await db.pushCampaign.findMany({ where: { kind: "CAMPAIGN", status: { in: ["QUEUED", "SENDING"] } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  for (const c of open) {
    while (Date.now() < until) if (await runCampaignBatch(c.id)) break;
  }
}
