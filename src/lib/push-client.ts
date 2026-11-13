"use client";

/** Browser side of web push: subscribe this browser to Webcenta notifications, or unsubscribe. */
export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Running as an installed app (Home Screen / desktop app window). iOS only allows push there. */
export function isStandalone(): boolean {
  return typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export function isIos(): boolean {
  return typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return true; // not exposed by this browser: assume it matches
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function serverKey(): Promise<Uint8Array<ArrayBuffer>> {
  const { publicKey } = (await (await fetch("/api/push", { cache: "no-store" })).json()) as { publicKey: string };
  return keyBytes(publicKey);
}

/** A subscription made with the server's current key (an old key's subscription is replaced). */
async function ensureSubscription(reg: ServiceWorkerRegistration): Promise<{ sub: PushSubscription; oldEndpoint?: string }> {
  const key = await serverKey();
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing.options?.applicationServerKey, key)) return { sub: existing };
  const oldEndpoint = existing?.endpoint;
  if (existing) await existing.unsubscribe().catch(() => undefined);
  return { sub: await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), oldEndpoint };
}

async function register(sub: PushSubscription, oldEndpoint?: string): Promise<boolean> {
  const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), standalone: isStandalone(), oldEndpoint }) });
  return r.ok;
}

/** Asks permission (must run from a tap/click), subscribes and registers with the server. */
export async function enablePush(): Promise<"on" | "denied" | "unsupported" | "error"> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const { sub, oldEndpoint } = await ensureSubscription(reg);
    return (await register(sub, oldEndpoint)) ? "on" : "error";
  } catch {
    return "error";
  }
}

const SYNC_KEY = "wc-push-sync";

/**
 * Re-confirms this browser's subscription with the server without asking anything: after
 * sign-in or sign-out (the account it belongs to changed), when the push service gave a new
 * subscription, when the server key changed, and otherwise twice a day. This is what keeps a
 * phone's subscription valid and linked to the right account.
 */
export async function syncPush(account: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const { sub, oldEndpoint } = await ensureSubscription(reg);
    const marker = `${sub.endpoint.slice(-24)}|${account}|${isStandalone() ? 1 : 0}`;
    let last: { m?: string; t?: number } = {};
    try { last = JSON.parse(localStorage.getItem(SYNC_KEY) ?? "{}") as typeof last; } catch { /* ignore */ }
    if (!oldEndpoint && last.m === marker && Date.now() - (last.t ?? 0) < 12 * 3600_000) return;
    if (await register(sub, oldEndpoint)) {
      try { localStorage.setItem(SYNC_KEY, JSON.stringify({ m: marker, t: Date.now() })); } catch { /* ignore */ }
    }
  } catch { /* offline or blocked: try again on the next visit */ }
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  try { localStorage.removeItem(SYNC_KEY); } catch { /* ignore */ }
  if (!sub) return;
  await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** Asks the server to send a test notification to this browser only. */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  const sub = await currentSubscription();
  if (!sub) return { ok: false, message: "Notifications are not turned on in this browser." };
  const r = await fetch("/api/push/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  return { ok: Boolean(j?.ok), message: j?.message ?? "Could not reach Webcenta. Check your connection." };
}
