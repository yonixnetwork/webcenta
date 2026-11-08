/** Hostname → application surface mapping (pure; unit tested). */
export type Surface = "public" | "www" | "admin" | "developer" | "api" | "unknown";

export interface HostConfig {
  publicHost: string;
  adminHost: string;
  developerHost: string;
}

export function hostConfigFromEnv(e: { PUBLIC_ORIGIN?: string; ADMIN_ORIGIN?: string; DEVELOPER_ORIGIN?: string }): HostConfig {
  const h = (o: string | undefined, fallback: string) => new URL(o || fallback).host.toLowerCase();
  return {
    publicHost: h(e.PUBLIC_ORIGIN, "http://localhost:3000"),
    adminHost: h(e.ADMIN_ORIGIN, "http://admin.localhost:3000"),
    developerHost: h(e.DEVELOPER_ORIGIN, "http://developers.localhost:3000"),
  };
}

export function classifyHost(rawHost: string | null, cfg: HostConfig): Surface {
  const host = (rawHost ?? "").toLowerCase().trim();
  if (!host) return "unknown";
  if (host === cfg.publicHost) return "public";
  if (host === `www.${cfg.publicHost}`) return "www";
  if (host === `api.${cfg.publicHost}`) return "api";
  if (host === cfg.adminHost) return "admin";
  if (host === cfg.developerHost) return "developer";
  return "unknown";
}

/** Internal route prefixes; reachable only through host rewrites. */
export const ADMIN_PREFIX = "/admin-host";
export const DEVELOPER_PREFIX = "/developer-host";

export function isInternalSurfacePath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return [ADMIN_PREFIX, DEVELOPER_PREFIX].some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * @param allowExternalFormRedirect only for the /go/:slug interstitial — Chrome applies
 *   form-action to redirects after a form POST, and that page's POST redirects (303) to the
 *   listing's official https website.
 */
export function buildCsp(nonce: string, isDev: boolean, mediaOrigin?: string, allowExternalFormRedirect = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob:${mediaOrigin ? ` ${mediaOrigin}` : ""}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    allowExternalFormRedirect ? "form-action 'self' https:" : "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
