import { db } from "@/server/db";
import { getSection, getSectionWithin } from "./store";

/**
 * Site-wide values from Admin → Settings that public pages, metadata, the
 * manifest, robots.txt and the Content Security Policy read.
 */
export async function siteInfo() {
  const [general, seo, social, webmaster] = await Promise.all(["general", "seo", "social", "webmaster"].map(getSection));
  return {
    name: general!.str("siteName") || "Webcenta",
    description: general!.str("siteDescription"),
    contactEmail: general!.str("contactEmail"),
    /** null = not set anywhere (pages decide on a development default). */
    banner: general!.source("bannerText") === "none" ? null : general!.str("bannerText"),
    defaultTitle: seo!.str("defaultTitle") || "Webcenta",
    allowIndexing: seo!.bool("allowIndexing"),
    ogImageUrl: seo!.str("ogImageUrl"),
    twitterHandle: seo!.str("twitterHandle"),
    socialLinks: (["x", "facebook", "instagram", "linkedin", "youtube", "tiktok", "github"] as const)
      .map((k) => ({ key: k, url: social!.str(k) }))
      .filter((l) => l.url.startsWith("https://")),
    verification: {
      google: webmaster!.str("googleVerification"),
      bing: webmaster!.str("bingVerification"),
      yandex: webmaster!.str("yandexVerification"),
    },
    indexNowKey: webmaster!.str("indexNowKey"),
  };
}

/** Third-party scripts enabled in Admin → Settings → Analytics & advertising. */
export async function analyticsConfig() {
  const [plausible, ga4, adsense] = await Promise.all(["plausible", "ga4", "adsense"].map(getSection));
  const pub = adsense!.str("publisherId").replace(/^ca-/, "");
  return {
    plausible: plausible!.ready ? { domain: plausible!.str("domain"), scriptUrl: plausible!.str("scriptUrl") || "https://plausible.io/js/script.js" } : null,
    ga4: ga4!.ready ? { measurementId: ga4!.str("measurementId") } : null,
    adsense: adsense!.ready ? { client: `ca-${pub}`, publisherId: pub, autoAds: adsense!.bool("autoAds"), adsTxtExtra: adsense!.str("adsTxtExtra") } : null,
  };
}

/** Pages where advertising may appear (never app detail, /go, accounts, developer or admin pages). */
export function isAdPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/categories" || pathname === "/search" || /^\/c\/[a-z0-9-]+\/?$/.test(pathname);
}

export interface CspExtras { script: string[]; connect: string[]; img: string[]; frame: string[] }

const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
};

/**
 * Additional CSP sources for the enabled analytics and advertising scripts on
 * a public page. Read by the proxy with a short timeout: when the database is
 * slow the policy stays strict (scripts are then blocked, never the page).
 */
export async function cspExtras(pathname: string): Promise<CspExtras & { mediaOrigin?: string }> {
  const [plausible, ga4, adsense, storage] = await Promise.all(["plausible", "ga4", "adsense", "storage"].map((id) => getSectionWithin(id, 1500)));
  const x: CspExtras & { mediaOrigin?: string } = { script: [], connect: [], img: [], frame: [] };
  const media = storage!.str("driver") === "s3" ? origin(storage!.str("mediaPublicBaseUrl")) : null;
  if (media) x.mediaOrigin = media;
  if (plausible!.ready) {
    const o = origin(plausible!.str("scriptUrl") || "https://plausible.io/js/script.js");
    if (o) {
      x.script.push(o);
      x.connect.push(o);
    }
  }
  if (ga4!.ready) {
    x.script.push("https://www.googletagmanager.com");
    x.connect.push("https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com");
    x.img.push("https://*.google-analytics.com", "https://*.googletagmanager.com");
  }
  if (adsense!.ready && adsense!.bool("autoAds") && isAdPage(pathname)) {
    x.script.push("https://pagead2.googlesyndication.com", "https://*.adtrafficquality.google");
    x.connect.push("https://pagead2.googlesyndication.com", "https://*.google.com", "https://*.doubleclick.net", "https://*.adtrafficquality.google");
    x.img.push("https:");
    x.frame.push("https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com", "https://www.google.com", "https://*.adtrafficquality.google");
  }
  return x;
}

/**
 * Queues an IndexNow notification for a listing page (Bing, Yandex and other
 * participating search engines). No-op unless an IndexNow key is configured.
 */
export async function queueIndexNow(slugs: string[]) {
  if (!slugs.length) return;
  const c = await getSection("webmaster");
  if (!c.str("indexNowKey")) return;
  await db.job.create({ data: { type: "indexnow.ping", payload: { paths: slugs.map((s) => `/app/${s}`) } } });
}

export async function pingIndexNow(paths: string[]): Promise<{ ok: boolean; status: number | null }> {
  const key = (await getSection("webmaster")).str("indexNowKey");
  const base = (process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
  if (!key || !base.startsWith("https://") || !paths.length) return { ok: false, status: null };
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/indexnow-key.txt`, urlList: paths.slice(0, 100).map((p) => base + p) }),
    signal: AbortSignal.timeout(10_000),
  });
  // 200 OK and 202 Accepted are both success.
  return { ok: res.status === 200 || res.status === 202, status: res.status };
}
