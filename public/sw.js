/* WebCenter service worker.
 * - Precaches the offline page and icons.
 * - Static assets (/_next/static, /icons): cache-first (content-hashed).
 * - Public page navigations: network-first, falling back to the offline page.
 * - NEVER caches: /api/*, /account*, /developer*, /go/*, auth pages, or non-GET requests.
 * Bump VERSION to roll out a new cache; clients are prompted to reload.
 */
const VERSION = "wc-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"];
const NO_CACHE = [/^\/api\//, /^\/account/, /^\/developer/, /^\/go\//, /^\/signin/, /^\/signup/, /^\/reset-password/, /^\/forgot-password/, /^\/account-export/, /^\/media\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
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
        if (res.ok && !res.headers.get("set-cookie")) { const copy = res.clone(); caches.open(PAGE_CACHE).then((c) => c.put(req, copy)); }
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match(OFFLINE_URL));
      }
    })());
  }
});
