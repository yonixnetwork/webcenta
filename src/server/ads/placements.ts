import { getSection } from "@/server/settings/store";

/**
 * Webcenta's ad placements and the provider that fills each one.
 *
 * Provider selection is deterministic (no switching per render): AdSense when it is enabled,
 * preferred, confirmed approved by the owner, and the placement has an AdSense unit ID;
 * otherwise Adsterra when it is enabled. At most one provider per placement; the browser falls
 * back from AdSense to Adsterra only when the AdSense unit is unfilled or its script is blocked.
 */
export type AdUnit = "native" | "300x250" | "728x90" | "468x60" | "320x50" | "160x600";
export type PlacementId = "home-native" | "home-display" | "listing" | "listing-native" | "mobile-compact" | "desktop-leaderboard" | "desktop-sidebar" | "desktop-small";

export interface PlacementDef {
  id: PlacementId;
  unit: AdUnit;
  /** Setting (Settings → Ad placements) that switches the placement on. */
  toggle: string;
  adsenseSlotKey: string;
  /** Viewport widths (CSS px) where the placement may load; wide units never load on phones. */
  minWidth: number;
  maxWidth?: number;
}

export const UNIT_SIZE: Record<AdUnit, { width: number; height: number }> = {
  native: { width: 0, height: 280 }, // responsive width; reserved height (adjusts to the content)
  "300x250": { width: 300, height: 250 },
  "728x90": { width: 728, height: 90 },
  "468x60": { width: 468, height: 60 },
  "320x50": { width: 320, height: 50 },
  "160x600": { width: 160, height: 600 },
};

export const PLACEMENTS: Record<PlacementId, PlacementDef> = {
  "home-native": { id: "home-native", unit: "native", toggle: "homeNative", adsenseSlotKey: "adsenseSlotHomeNative", minWidth: 0 },
  "home-display": { id: "home-display", unit: "300x250", toggle: "homeDisplay", adsenseSlotKey: "adsenseSlotHomeDisplay", minWidth: 0 },
  listing: { id: "listing", unit: "300x250", toggle: "listing", adsenseSlotKey: "adsenseSlotListing", minWidth: 0 },
  "listing-native": { id: "listing-native", unit: "native", toggle: "listingNative", adsenseSlotKey: "adsenseSlotListingNative", minWidth: 0 },
  // One responsive banner position: 320 × 50 on phones, 468 × 60 on tablets, 728 × 90 on desktops.
  "mobile-compact": { id: "mobile-compact", unit: "320x50", toggle: "mobileCompact", adsenseSlotKey: "adsenseSlotMobile", minWidth: 0, maxWidth: 499 },
  "desktop-leaderboard": { id: "desktop-leaderboard", unit: "728x90", toggle: "desktopLeaderboard", adsenseSlotKey: "adsenseSlotLeaderboard", minWidth: 1024 },
  "desktop-sidebar": { id: "desktop-sidebar", unit: "160x600", toggle: "desktopSidebar", adsenseSlotKey: "adsenseSlotSidebar", minWidth: 1280 },
  "desktop-small": { id: "desktop-small", unit: "468x60", toggle: "desktopSmall", adsenseSlotKey: "adsenseSlotSmall", minWidth: 500, maxWidth: 1023 },
};

const UNIT_FIELD: Record<Exclude<AdUnit, "native">, string> = { "300x250": "key300x250", "728x90": "key728x90", "468x60": "key468x60", "320x50": "key320x50", "160x600": "key160x600" };

export interface AdsterraUnit { host: string; unit: AdUnit; key: string; isolation: "sandboxed" | "standard" }

/** The Adsterra code for one unit (validated: keys are 32 hex characters, the host a plain host name). */
export async function adsterraUnit(unit: AdUnit): Promise<AdsterraUnit | null> {
  const a = await getSection("adsterra");
  if (!a.enabled) return null;
  const host = a.str("scriptHost");
  const key = unit === "native" ? a.str("nativeId") : a.str(UNIT_FIELD[unit]);
  if (!/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,63}$/.test(host) || !/^[a-f0-9]{32}$/.test(key)) return null;
  return { host, unit, key, isolation: a.str("isolation") === "standard" ? "standard" : "sandboxed" };
}

export interface ResolvedPlacement {
  id: PlacementId;
  unit: AdUnit;
  width: number;
  height: number;
  minWidth: number;
  maxWidth?: number;
  provider: "adsense" | "adsterra";
  adsense?: { client: string; slot: string };
  /** Adsterra unit used directly, or as the fallback for an unfilled/blocked AdSense unit. */
  adsterra?: { unit: AdUnit; isolation: "sandboxed" | "standard" };
}

/** Which provider fills a placement right now (null = no ad). */
export async function resolvePlacement(id: PlacementId): Promise<ResolvedPlacement | null> {
  const def = PLACEMENTS[id];
  const [ads, adsense] = await Promise.all([getSection("ads"), getSection("adsense")]);
  if (!ads.enabled || !ads.bool(def.toggle)) return null;
  const size = UNIT_SIZE[def.unit];
  const ster = await adsterraUnit(def.unit);
  const base = { id, unit: def.unit, width: size.width, height: size.height, minWidth: def.minWidth, maxWidth: def.maxWidth };
  const slot = ads.str(def.adsenseSlotKey);
  const pub = adsense.str("publisherId").replace(/^ca-/, "");
  if (ads.str("preferredProvider") !== "adsterra" && ads.bool("adsenseApproved") && adsense.ready && /^pub-\d{10,20}$/.test(pub) && /^\d{6,20}$/.test(slot)) {
    return { ...base, provider: "adsense", adsense: { client: `ca-${pub}`, slot }, adsterra: ster ? { unit: ster.unit, isolation: ster.isolation } : undefined };
  }
  if (ster) return { ...base, provider: "adsterra", adsterra: { unit: ster.unit, isolation: ster.isolation } };
  return null;
}

/** True when AdSense units may appear (the CSP then allows Google's ad servers on those pages). */
export async function adsenseUnitsActive(): Promise<boolean> {
  const [ads, adsense] = await Promise.all([getSection("ads"), getSection("adsense")]);
  return ads.enabled && adsense.ready && ads.bool("adsenseApproved") && ads.str("preferredProvider") !== "adsterra";
}

/** The sandboxed frame document for one Adsterra unit. Every value is validated above. */
export function adsterraFrameHtml(u: AdsterraUnit, parentOrigin: string): string {
  const size = UNIT_SIZE[u.unit];
  const code = u.unit === "native"
    ? `<script async="async" data-cfasync="false" src="https://${u.host}/21/${u.key}"></script>\n<div id="container-${u.key}"></div>`
    : `<script>\natOptions = {\n'key' : '${u.key}',\n'format' : 'iframe',\n'height' : ${size.height},\n'width' : ${size.width},\n'params' : {}\n};\n</script>\n<script src="https://${u.host}/22/${u.key}"></script>`;
  // Reports the content height to the page (native units are responsive), so the reserved space fits.
  const reporter = `<script>(function(){var last=0;function send(){var h=Math.ceil(document.documentElement.scrollHeight);if(h!==last){last=h;try{parent.postMessage({webcentaAd:true,height:h},${JSON.stringify(parentOrigin)});}catch(e){}}}if(window.ResizeObserver)new ResizeObserver(send).observe(document.documentElement);window.addEventListener("load",send);setTimeout(send,1500);setTimeout(send,5000);})();</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Advertisement</title><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flex;justify-content:center;align-items:flex-start;font-family:system-ui,sans-serif}</style></head><body>\n${code}\n${reporter}\n</body></html>`;
}
