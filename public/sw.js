/* Webcenta service worker.
 * - Precaches the offline page together with the CSS/JS it references, so the
 *   offline screen is fully styled and its Retry button works without a network.
 * - Static assets (/_next/static, /icons): cache-first (content-hashed).
 * - Public page navigations: network-first, falling back to the offline page.
 * - NEVER caches: /api/*, /account*, /developer*, /go/*, auth pages, non-GET requests,
 *   or any page rendered for a signed-in visitor (marked x-wc-personal by the proxy).
 * Bump VERSION to roll out a new cache; clients are prompted to reload.
 */
const VERSION = "wc-v4";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];
const NO_CACHE = [/^\/api\//, /^\/account/, /^\/developer/, /^\/go\//, /^\/signin/, /^\/signup/, /^\/reset-password/, /^\/forgot-password/, /^\/account-export/, /^\/media\//];

async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(PRECACHE);
  // Also cache the offline page's own stylesheets and scripts (content-hashed).
  const res = await cache.match(OFFLINE_URL);
  if (!res) return;
  const html = await res.text();
  const assets = new Set();
  for (const m of html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1].replace(/&amp;/g, "&"));
  await Promise.all([...assets].map((u) => cache.add(u).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Web push: show the notification Webcenta sent, and open its page when tapped.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : "Webcenta";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/favicon-48.png",
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) if (w.url === url && "focus" in w) return w.focus();
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NO_CACHE.some((r) => r.test(url.pathname))) {
    if (req.mode === "navigate") event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(STATIC_CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Cache only successful, non-personalised public pages (no Set-Cookie).
        if (res.ok && !res.headers.get("set-cookie") && !res.headers.get("x-wc-personal")) { const copy = res.clone(); caches.open(PAGE_CACHE).then((c) => c.put(req, copy)); }
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match(OFFLINE_URL));
      }
    })());
  }
});
