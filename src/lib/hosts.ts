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
