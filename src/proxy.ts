import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PREFIX, buildCsp, developerRewritePath, hostConfigFromEnv, isInternalSurfacePath, originsFromEnv, resolveSurface } from "@/lib/hosts";
import { STATIC_ERROR_CSP, staticErrorPage } from "@/lib/static-error-pages";
import { getSectionWithin } from "@/server/settings/store";
import { cspExtras } from "@/server/settings/site";
import { decideLocale } from "@/i18n/routing";
import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocaleList } from "@/i18n/locales";

/**
 * Edge of the application: host routing and per-request security headers.
 * Authorisation is NOT done here — admin permissions are enforced server-side
 * in every admin route/action (Phase 3).
 */
export async function proxy(request: NextRequest) {
  const cfg = hostConfigFromEnv({
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    DEVELOPER_ORIGIN: process.env.DEVELOPER_ORIGIN,
  });
  const { surface, host } = resolveSurface(request.headers, cfg);
  const url = request.nextUrl;
  const origins = originsFromEnv({ PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN, ADMIN_ORIGIN: process.env.ADMIN_ORIGIN, DEVELOPER_ORIGIN: process.env.DEVELOPER_ORIGIN });
  logRouting(request, host, surface);

  if (surface === "www") {
    const target = new URL(url.pathname + url.search, origins.publicOrigin);
    // Built by hand so the Location header is always absolute (canonical host).
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // The developer portal is its own site on developers.<host>; old /developer links
  // on the public site move there permanently.
  if (surface === "public" && (url.pathname === "/developer" || url.pathname.startsWith("/developer/"))) {
    const target = new URL((url.pathname.slice("/developer".length) || "/") + url.search, origins.developerOrigin);
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // api.webcenta.com is reserved for the HTTP API: it serves /api/* only (no
  // session cookies reach it; the site itself calls webcenta.com/api). Any other
  // path is redirected to the same path on the main site.
  if (surface === "api" && !url.pathname.startsWith("/api/")) {
    const target = new URL(url.pathname + url.search, process.env.PUBLIC_ORIGIN || `https://${cfg.publicHost}`);
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // Admin IP allow-list (Admin → Settings → Security, or ADMIN_IP_ALLOWLIST).
  // The client IP honours the configured number of trusted proxies.
  if (surface === "admin") {
    const sec = await getSectionWithin("security", 1500);
    const allowed = sec.str("adminIpAllowlist").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (allowed.length) {
      const hops = Math.max(0, Math.min(5, sec.num("trustedProxyHops")));
      const xff = (request.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const ip = request.headers.get("cf-connecting-ip") ?? (hops > 0 ? xff[Math.max(0, xff.length - hops)] : undefined) ?? request.headers.get("x-real-ip") ?? "";
      if (!allowed.includes(ip)) return new NextResponse("Not found", { status: 404 });
    }
  }

  // Maintenance mode: every public request gets a real 503 with Retry-After,
  // served without touching the app or the database. The admin portal and the
  // cron endpoint keep working so the team can finish the maintenance.
  if (process.env.MAINTENANCE_MODE === "true" && surface !== "admin" && !url.pathname.startsWith("/api/cron/")) {
    const headers = { "retry-after": process.env.MAINTENANCE_RETRY_AFTER || "600", "cache-control": "no-store", "x-robots-tag": "noindex" };
    if (url.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Service temporarily unavailable", maintenance: true }, { status: 503, headers });
    }
    return new NextResponse(staticErrorPage("503"), {
      status: 503,
      headers: { ...headers, "content-type": "text/html; charset=utf-8", "content-security-policy": STATIC_ERROR_CSP },
    });
  }

  // Languages (public site only): /es/… is the Spanish version of /…, served by the same route.
  let path = url.pathname;
  let locale = DEFAULT_LOCALE;
  if (surface === "public") {
    const intl = await getSectionWithin("i18n", 1500);
    const decision = decideLocale({
      pathname: url.pathname,
      search: url.search,
      method: request.method,
      cookieLocale: request.cookies.get(LOCALE_COOKIE)?.value,
      enabled: parseLocaleList(intl.str("enabledLocales")),
      prefetch: request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch",
    });
    if (decision.kind === "redirect") {
      return new NextResponse(null, { status: decision.status, headers: { location: new URL(decision.location, origins.publicOrigin).toString(), vary: "Cookie", "cache-control": "private, no-store" } });
    }
    path = decision.path;
    locale = decision.locale;
  }

  // Internal surface folders must never be reachable by path on any host.
  if (isInternalSurfacePath(path)) {
    return NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });
  }

  // Search engine ownership files (Google HTML file, Bing XML file), public site only.
  if (surface === "public" && (/^\/google[0-9a-f]{8,32}\.html$/.test(path) || path === "/BingSiteAuth.xml")) {
    return NextResponse.rewrite(new URL(`/api/site-verification/${encodeURIComponent(path.slice(1))}`, request.url));
  }
  // Ad frames (public site only) carry their own Content Security Policy; see src/app/ads/frame.
  if (surface === "public" && /^\/ads\/frame\/[a-z0-9]+$/.test(path)) return NextResponse.next();
  if (path.startsWith("/ads/")) return NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // Analytics/advertising sources are added only on the public site (never the admin or developer portals).
  const extras = surface !== "public" ? { script: [], connect: [], img: [], frame: [] } : await cspExtras(path).catch(() => ({ script: [], connect: [], img: [], frame: [] }));
  const mediaOrigin = (extras as { mediaOrigin?: string }).mediaOrigin;
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development", mediaOrigin, surface !== "admin" && /^\/go\/[a-z0-9-]+\/?$/.test(path), extras);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-webcenta-surface", surface);
  // Lets not-found boundaries (which receive no params) know which URL failed.
  requestHeaders.set("x-pathname", path);
  // Always set here (never trusted from the client): the language of this request.
  requestHeaders.set("x-wc-locale", locale);

  let response: NextResponse;
  const devPath = surface === "developer" ? developerRewritePath(path) : null;
  if (surface === "admin") {
    const prefix = ADMIN_PREFIX;
    const rewritten = new URL(prefix + (path === "/" ? "" : path) + url.search, request.url);
    response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
  } else if (devPath) {
    response = NextResponse.rewrite(new URL(devPath + url.search, request.url), { request: { headers: requestHeaders } });
  } else if (path !== url.pathname) {
    response = NextResponse.rewrite(new URL(path + url.search, request.url), { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("content-security-policy", csp);
  // The admin portal and unknown hosts (e.g. a temporary hosting domain) are never indexed.
  if (surface !== "public" || !(await getSectionWithin("seo", 1500)).bool("allowIndexing")) response.headers.set("x-robots-tag", "noindex, nofollow");
  if (surface === "admin" || surface === "developer") response.headers.set("cache-control", "no-store");
  // Pages rendered for a signed-in visitor are never stored by the service worker.
  if (request.cookies.getAll().some((c) => c.name.endsWith("session_token"))) response.headers.set("x-wc-personal", "1");
  return response;
}

/**
 * One log line per distinct hostname / forwarded host / surface seen by this
 * process, so the hosting runtime log shows how each domain is routed (no
 * paths, cookies or query strings).
 */
const seenRoutes = ((globalThis as unknown as { __webcentaRoutes?: Set<string> }).__webcentaRoutes ??= new Set());
function logRouting(request: NextRequest, host: string, surface: string) {
  const key = `${request.headers.get("host")}|${request.headers.get("x-forwarded-host")}|${surface}`;
  if (seenRoutes.has(key) || seenRoutes.size > 50) return;
  seenRoutes.add(key);
  console.log(`[webcenta] routing pid=${process.pid} host=${request.headers.get("host")} x-forwarded-host=${request.headers.get("x-forwarded-host") ?? "-"} -> ${surface} (${host})`);
}

export const config = {
  matcher: [
    // Language-prefixed URLs, router prefetches included (they must be rewritten too). The list
    // is checked against src/i18n/locales.ts by tests/unit/i18n.test.ts.
    "/:locale(es|fr|de|pt-br|it|nl|ru|ja|zh-hans|ko|ar|hi|tr|pl|id|vi|th|uk|sv|da|nb|fi|cs|el|he|ro|hu|ms|fa|bn|ur|fil|pt-pt|zh-hant|sk|bg|hr|sr|ta|ca|lt|lv|et|sl|sw|te|mr|gu|af|en)",
    "/:locale(es|fr|de|pt-br|it|nl|ru|ja|zh-hans|ko|ar|hi|tr|pl|id|vi|th|uk|sv|da|nb|fi|cs|el|he|ro|hu|ms|fa|bn|ur|fil|pt-pt|zh-hant|sk|bg|hr|sr|ta|ca|lt|lv|et|sl|sw|te|mr|gu|af|en)/:path*",
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|errors/|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
