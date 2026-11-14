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

/** A coarse device label from the user agent (diagnostics only). */
export function platformOf(ua: string | null | undefined): string {
  const u = (ua ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  if (/macintosh|mac os x/.test(u)) return "macos";
  if (/windows/.test(u)) return "windows";
  if (/linux|cros/.test(u)) return "desktop-other";
  return "unknown";
}

/**
 * Saves or refreshes this browser's subscription. Called when notifications are turned on and
 * again whenever the browser confirms the subscription (sign-in, sign-out, a new subscription
 * after the old one expired). The subscription is linked to whoever is signed in now, or to no
 * one, so a shared device never receives the previous account's notifications.
 */
export async function saveSubscription(s: SubscriptionInput, userId: string | null, userAgent: string | null, opts: { standalone?: boolean; oldEndpoint?: string } = {}) {
  const hash = endpointHash(s.endpoint);
  const data = { p256dh: s.keys.p256dh, auth: s.keys.auth, userId, userAgent: userAgent?.slice(0, 255) ?? null, platform: platformOf(userAgent), standalone: Boolean(opts.standalone), lastSyncedAt: new Date() };
  if (opts.oldEndpoint && opts.oldEndpoint !== s.endpoint) await removeSubscription(opts.oldEndpoint);
  await db.pushSubscription.upsert({
    where: { endpointHash: hash },
    create: { endpointHash: hash, endpoint: s.endpoint, ...data },
    update: { ...data, failureCount: 0, lastError: null, lastStatus: null },
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

export interface PushMessage { title: string; body: string; url: string; tag?: string }
export interface DeliveryContext { kind?: "CAMPAIGN" | "EVENT" | "REMINDER" | "TEST"; campaignId?: string; userId?: string }

/** What a push service's answer means (RFC 8030 / FCM / Apple / Mozilla / WNS). */
export function categorize(status: number | undefined, message = ""): { outcome: "ACCEPTED" | "FAILED" | "EXPIRED"; category: string | null } {
  if (status && status >= 200 && status < 300) return { outcome: "ACCEPTED", category: null };
  if (status === 404 || status === 410) return { outcome: "EXPIRED", category: "expired" };
  if (status === 401 || status === 403) return { outcome: "FAILED", category: "unauthorized" }; // VAPID key mismatch or invalid JWT
  if (status === 400) return { outcome: "FAILED", category: "bad-request" };
  if (status === 413) return { outcome: "FAILED", category: "payload-too-large" };
  if (status === 429) return { outcome: "FAILED", category: "rate-limited" };
  if (status && status >= 500) return { outcome: "FAILED", category: "service-error" };
  if (/timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket/i.test(message)) return { outcome: "FAILED", category: "network" };
  return { outcome: "FAILED", category: "other" };
}

/**
 * Sends one message to a batch of subscriptions and records every attempt (PushDelivery).
 * Urgency "high" asks the push service to deliver immediately, also to phones in battery-saving
 * idle mode (Android Doze delays "normal" messages, sometimes for hours). Subscriptions the push
 * service reports as gone (404/410) are removed. "Accepted" means the push service took the
 * message; whether the device displayed it cannot be known by the server.
 */
export async function sendBatch(subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string; userId?: string | null; platform?: string | null }>, msg: PushMessage, ctx: DeliveryContext = {}) {
  const keys = await vapidKeys();
  const subj = await subject();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", ts: Date.now() });
  let delivered = 0, failed = 0, expired = 0;
  const log: Array<{ campaignId: string | null; subscriptionId: string; userId: string | null; outcome: string; statusCode: number | null; category: string | null; platform: string | null; kind: string }> = [];
  await Promise.all(subs.map(async (s) => {
    let status: number | undefined, message = "";
    try {
      const r = await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { vapidDetails: { subject: subj, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600, urgency: "high", topic: msg.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined, timeout: 10_000 });
      status = r.statusCode;
    } catch (e) {
      status = (e as { statusCode?: number }).statusCode;
      message = e instanceof Error ? e.message : String(e);
    }
    const c = categorize(status, message);
    log.push({ campaignId: ctx.campaignId ?? null, subscriptionId: s.id, userId: s.userId ?? ctx.userId ?? null, outcome: c.outcome, statusCode: status ?? null, category: c.category, platform: s.platform ?? null, kind: ctx.kind ?? "CAMPAIGN" });
    if (c.outcome === "ACCEPTED") {
      delivered++;
      await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failureCount: 0, lastStatus: status ?? null, lastError: null } }).catch(() => undefined);
    } else if (c.outcome === "EXPIRED") {
      failed++; expired++;
      await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
    } else {
      failed++;
      console.warn(`[webcenta] push ${c.category} (HTTP ${status ?? "-"}) platform=${s.platform ?? "?"}`);
      await db.pushSubscription.update({ where: { id: s.id }, data: { failureCount: { increment: 1 }, lastFailureAt: new Date(), lastStatus: status ?? null, lastError: `${c.category}${status ? ` (HTTP ${status})` : ""}: ${message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 200)}` } }).catch(() => undefined);
    }
  }));
  if (log.length) await db.pushDelivery.createMany({ data: log }).catch(() => undefined);
  return { delivered, failed, expired };
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
    orderBy: { id: "asc" }, take: BATCH, select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true, platform: true },
  });
  if (!subs.length) {
    await db.pushCampaign.update({ where: { id: c.id }, data: { status: "SENT", completedAt: new Date() } });
    return true;
  }
  const r = await sendBatch(subs, { title: c.title, body: c.body, url: c.url, tag: `wc-${c.id.slice(-12)}` }, { kind: "CAMPAIGN", campaignId: c.id });
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
export async function continueCampaigns(budgetMs = 15_000): Promise<{ campaigns: number; finished: number }> {
  const until = Date.now() + budgetMs;
  const open = await db.pushCampaign.findMany({ where: { kind: "CAMPAIGN", status: { in: ["QUEUED", "SENDING"] } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  let finished = 0;
  for (const c of open) {
    while (Date.now() < until) if (await runCampaignBatch(c.id)) { finished++; break; }
  }
  return { campaigns: open.length, finished };
}

/**
 * Admin → Push notifications → Test push: one notification to ONE chosen subscription. It never
 * fans out (the subscription is addressed by id) and returns the push service's real answer.
 */
export async function sendTestPushTo(subscriptionId: string, msg: PushMessage) {
  const sub = await db.pushSubscription.findUnique({ where: { id: subscriptionId }, select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true, platform: true } });
  if (!sub) return { found: false as const };
  await sendBatch([sub], { ...msg, tag: "wc-test" }, { kind: "TEST", userId: sub.userId ?? undefined });
  const last = await db.pushDelivery.findFirst({ where: { subscriptionId: sub.id, kind: "TEST" }, orderBy: { createdAt: "desc" }, select: { outcome: true, statusCode: true, category: true } });
  return { found: true as const, accepted: last?.outcome === "ACCEPTED", outcome: last?.outcome ?? "FAILED", statusCode: last?.statusCode ?? null, category: last?.category ?? null, platform: sub.platform };
}
