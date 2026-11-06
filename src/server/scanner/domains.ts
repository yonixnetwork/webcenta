import { domainToUnicode } from "node:url";

/** Approximate registrable domain (eTLD+1) for common public suffixes. */
const MULTI = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br", "com.cn", "co.in", "co.za", "com.mx", "com.tr", "com.sg", "com.hk", "co.kr"]);
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  return MULTI.has(last2) ? parts.slice(-3).join(".") : last2;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Normalises look-alike characters so "paypa1" and "pаypal" (Cyrillic а) compare equal to "paypal". */
export function skeleton(s: string): string {
  const map: Record<string, string> = { "0": "o", "1": "l", "3": "e", "5": "s", "7": "t", "4": "a", "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ӏ": "l", "ԁ": "d" };
  return [...domainToUnicode(s).toLowerCase()].map((c) => map[c] ?? c).join("").replace(/rn/g, "m").replace(/vv/g, "w");
}

/** Well-known brands frequently impersonated by phishing sites. */
export const PROTECTED_BRANDS = ["paypal", "apple", "google", "microsoft", "amazon", "facebook", "instagram", "netflix", "metamask", "binance", "coinbase", "kraken", "trustwallet", "ledger", "outlook", "office365", "whatsapp", "telegram", "stripe", "chase", "wellsfargo", "bankofamerica", "dhl", "fedex", "steam", "roblox"];

export function brandLabel(domain: string): string {
  return registrableDomain(domain).split(".")[0] ?? domain;
}
