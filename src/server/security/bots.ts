import { lookup, reverse } from "node:dns/promises";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";

/**
 * Search-engine crawler verification. A user agent saying "Googlebot" proves nothing; the
 * address must reverse-resolve to the search engine's domain and that name must resolve back to
 * the same address (the method Google and Bing document). Verified crawlers get a generous
 * search allowance; everyone else the normal one. Nothing here blocks crawlers from public pages.
 */
const CRAWLERS: Array<{ ua: RegExp; domains: string[] }> = [
  { ua: /googlebot|google-inspectiontool|googleother|adsbot-google|mediapartners-google/i, domains: [".googlebot.com", ".google.com", ".googleusercontent.com"] },
  { ua: /bingbot|msnbot|adidxbot|bingpreview/i, domains: [".search.msn.com"] },
  { ua: /applebot/i, domains: [".applebot.apple.com"] },
  { ua: /duckduckbot/i, domains: [".duckduckgo.com"] },
  { ua: /yandex(bot|images)/i, domains: [".yandex.ru", ".yandex.net", ".yandex.com"] },
];

const cache = new Map<string, { ok: boolean; at: number }>();

export function claimedCrawler(ua: string | null) {
  return ua ? CRAWLERS.find((c) => c.ua.test(ua)) ?? null : null;
}

export async function isVerifiedCrawler(ip: string | null, ua: string | null): Promise<boolean> {
  const c = claimedCrawler(ua);
  if (!c || !ip) return false;
  const key = `${ip}|${c.domains[0]}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.ok;
  let ok = false;
  try {
    const names = await Promise.race([reverse(ip), new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500))]);
    for (const name of names) {
      if (!c.domains.some((d) => name.toLowerCase().endsWith(d))) continue;
      const back = await lookup(name, { all: true });
      if (back.some((a) => a.address === ip)) { ok = true; break; }
    }
  } catch { ok = false; }
  if (cache.size > 5000) cache.clear();
  cache.set(key, { ok, at: Date.now() });
  return ok;
}

/**
 * Search is the most expensive public request (full-text queries). Per address: 60 searches a
 * minute for people (far above normal use), 600 for verified search-engine crawlers.
 */
export async function allowSearch(h: Headers): Promise<boolean> {
  const ip = clientIp(h, (await networkSettings()).trustedProxyHops) ?? "unknown";
  const ua = h.get("user-agent");
  const verified = claimedCrawler(ua) ? await isVerifiedCrawler(ip, ua) : false;
  return rateLimit(`search:${verified ? "crawler:" : ""}${ip}`, verified ? 600 : 60, 60);
}
