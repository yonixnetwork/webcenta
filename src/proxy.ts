import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PREFIX, buildCsp, classifyHost, hostConfigFromEnv, isInternalSurfacePath } from "@/lib/hosts";
import { STATIC_ERROR_CSP, staticErrorPage } from "@/lib/static-error-pages";

/**
 * Edge of the application: host routing and per-request security headers.
 * Authorisation is NOT done here — admin permissions are enforced server-side
 * in every admin route/action (Phase 3).
 */
export function proxy(request: NextRequest) {
  const cfg = hostConfigFromEnv({
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    DEVELOPER_ORIGIN: process.env.DEVELOPER_ORIGIN,
  });
  const surface = classifyHost(request.headers.get("host"), cfg);
  const url = request.nextUrl;

  if (surface === "www") {
    const target = new URL(url.pathname + url.search, process.env.PUBLIC_ORIGIN || `https://${cfg.publicHost}`);
    // Built by hand so the Location header is always absolute (canonical host).
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // The developer portal lives at /developer on the public host (shared, host-only
  // session cookie); developers.webcenta.com redirects there.
  if (surface === "developer") {
    const target = new URL(`/developer${url.pathname === "/" ? "" : url.pathname}${url.search}`, process.env.PUBLIC_ORIGIN || `https://${cfg.publicHost}`);
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // api.webcenta.com is reserved for the HTTP API: it serves /api/* only (no
  // session cookies reach it; the site itself calls webcenta.com/api). Any other
  // path is redirected to the same path on the main site.
  if (surface === "api" && !url.pathname.startsWith("/api/")) {
    const target = new URL(url.pathname + url.search, process.env.PUBLIC_ORIGIN || `https://${cfg.publicHost}`);
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // Admin IP allow-list (optional, recommended behind Cloudflare or on a VPS).
  if (surface === "admin" && process.env.ADMIN_IP_ALLOWLIST) {
    const allowed = process.env.ADMIN_IP_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "";
    if (!allowed.includes(ip)) return new NextResponse("Not found", { status: 404 });
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

  // Internal surface folders must never be reachable by path on any host.
  if (isInternalSurfacePath(url.pathname)) {
    return NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const mediaOrigin = process.env.MEDIA_PUBLIC_BASE_URL ? new URL(process.env.MEDIA_PUBLIC_BASE_URL).origin : undefined;
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development", mediaOrigin, surface !== "admin" && /^\/go\/[a-z0-9-]+\/?$/.test(url.pathname));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-webcenta-surface", surface);
  // Lets not-found boundaries (which receive no params) know which URL failed.
  requestHeaders.set("x-pathname", url.pathname);

  let response: NextResponse;
  if (surface === "admin") {
    const prefix = ADMIN_PREFIX;
    const rewritten = new URL(prefix + (url.pathname === "/" ? "" : url.pathname) + url.search, request.url);
    response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("content-security-policy", csp);
  // The admin portal and unknown hosts (e.g. a temporary hosting domain) are never indexed.
  if (surface !== "public") response.headers.set("x-robots-tag", "noindex, nofollow");
  if (surface === "admin") response.headers.set("cache-control", "no-store");
  // Pages rendered for a signed-in visitor are never stored by the service worker.
  if (request.cookies.getAll().some((c) => c.name.endsWith("session_token"))) response.headers.set("x-wc-personal", "1");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|errors/|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
