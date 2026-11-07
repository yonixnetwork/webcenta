import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PREFIX, buildCsp, classifyHost, hostConfigFromEnv, isInternalSurfacePath } from "@/lib/hosts";

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
  // session cookie); developers.webcenter.com redirects there.
  if (surface === "developer") {
    const target = new URL(`/developer${url.pathname === "/" ? "" : url.pathname}${url.search}`, process.env.PUBLIC_ORIGIN || `https://${cfg.publicHost}`);
    return new NextResponse(null, { status: 308, headers: { location: target.toString() } });
  }

  // Admin IP allow-list (optional, recommended behind Cloudflare or on a VPS).
  if (surface === "admin" && process.env.ADMIN_IP_ALLOWLIST) {
    const allowed = process.env.ADMIN_IP_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "";
    if (!allowed.includes(ip)) return new NextResponse("Not found", { status: 404 });
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
  requestHeaders.set("x-webcenter-surface", surface);

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
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
