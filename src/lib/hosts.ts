/** Hostname → application surface mapping (pure; unit tested). */
export type Surface = "public" | "www" | "admin" | "developer" | "api" | "unknown";

export interface HostConfig {
  publicHost: string;
  adminHost: string;
  developerHost: string;
}

type OriginEnv = { PUBLIC_ORIGIN?: string; ADMIN_ORIGIN?: string; DEVELOPER_ORIGIN?: string };

/**
 * The three origins. Only PUBLIC_ORIGIN must be set: the admin and developer
 * origins default to the "admin." and "developers." subdomains of it
 * (https://webcenta.com → https://admin.webcenta.com).
 */
export function originsFromEnv(e: OriginEnv = process.env as OriginEnv): { publicOrigin: string; adminOrigin: string; developerOrigin: string } {
  const pub = new URL(e.PUBLIC_ORIGIN || "http://localhost:3000");
  const sub = (name: string) => `${pub.protocol}//${name}.${pub.host}`;
  const clean = (o: string) => o.replace(/\/$/, "");
  return {
    publicOrigin: clean(pub.origin),
    adminOrigin: clean(e.ADMIN_ORIGIN || sub("admin")),
    developerOrigin: clean(e.DEVELOPER_ORIGIN || sub("developers")),
  };
}

export const adminOrigin = (e: OriginEnv = process.env as OriginEnv) => originsFromEnv(e).adminOrigin;
export const publicOrigin = (e: OriginEnv = process.env as OriginEnv) => originsFromEnv(e).publicOrigin;
export const developerOrigin = (e: OriginEnv = process.env as OriginEnv) => originsFromEnv(e).developerOrigin;

export function hostConfigFromEnv(e: OriginEnv): HostConfig {
  const o = originsFromEnv(e);
  const h = (x: string) => new URL(x).host.toLowerCase();
  return { publicHost: h(o.publicOrigin), adminHost: h(o.adminOrigin), developerHost: h(o.developerOrigin) };
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

/**
 * The surface a request is for. The Host header decides; X-Forwarded-Host is
 * consulted only when Host is not one of ours (e.g. a reverse proxy that
 * rewrites Host to 127.0.0.1), so it can never move a request between two of
 * our own hosts.
 */
export function resolveSurface(h: { get(name: string): string | null }, cfg: HostConfig): { surface: Surface; host: string } {
  const host = (h.get("host") ?? "").toLowerCase().trim();
  const direct = classifyHost(host, cfg);
  if (direct !== "unknown") return { surface: direct, host };
  const forwarded = (h.get("x-forwarded-host") ?? "").split(",")[0]!.toLowerCase().trim();
  const viaProxy = forwarded ? classifyHost(forwarded, cfg) : "unknown";
  return viaProxy !== "unknown" ? { surface: viaProxy, host: forwarded } : { surface: "unknown", host };
}

/**
 * Where a developers.<host> request is served inside the app. API, media and
 * auth endpoints are shared; every page lives under DEVELOPER_PREFIX.
 */
export function developerRewritePath(pathname: string): string | null {
  if (pathname.startsWith("/api/") || pathname.startsWith("/media/")) return null;
  return DEVELOPER_PREFIX + (pathname === "/" ? "" : pathname);
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
export interface CspAdditions { script?: string[]; connect?: string[]; img?: string[]; frame?: string[] }

/** Only plain https origins/wildcards (or "https:") may be added to the policy. */
const safeSource = (s: string) => s === "https:" || /^https:\/\/(\*\.)?[a-z0-9.-]+(:[0-9]+)?$/.test(s);
const extra = (list?: string[]) => {
  const ok = [...new Set((list ?? []).filter(safeSource))];
  return ok.length ? ` ${ok.join(" ")}` : "";
};

export function buildCsp(nonce: string, isDev: boolean, mediaOrigin?: string, allowExternalFormRedirect = false, add: CspAdditions = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${extra(add.script)}${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob:${mediaOrigin ? ` ${mediaOrigin}` : ""}${extra(add.img)}`,
    "font-src 'self'",
    `connect-src 'self'${extra(add.connect)}`,
    ...(add.frame?.length ? [`frame-src${extra(add.frame)}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    allowExternalFormRedirect ? "form-action 'self' https:" : "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
