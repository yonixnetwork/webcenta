import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_PREFIX, DEVELOPER_PREFIX, buildCsp, classifyHost, hostConfigFromEnv, isInternalSurfacePath } from "@/lib/hosts";

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

  // Internal surface folders must never be reachable by path on any host.
  if (isInternalSurfacePath(url.pathname)) {
    return NextResponse.rewrite(new URL("/__not-found", request.url), { status: 404 });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const mediaOrigin = process.env.MEDIA_PUBLIC_BASE_URL ? new URL(process.env.MEDIA_PUBLIC_BASE_URL).origin : undefined;
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development", mediaOrigin);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-webcenter-surface", surface);

  let response: NextResponse;
  if (surface === "admin" || surface === "developer") {
    const prefix = surface === "admin" ? ADMIN_PREFIX : DEVELOPER_PREFIX;
    const rewritten = new URL(prefix + (url.pathname === "/" ? "" : url.pathname) + url.search, request.url);
    response = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("content-security-policy", csp);
  // Admin/developer portals and unknown hosts (e.g. a temporary hosting domain) are never indexed.
  if (surface !== "public") response.headers.set("x-robots-tag", "noindex, nofollow");
  if (surface === "admin") response.headers.set("cache-control", "no-store");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
