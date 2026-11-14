import { getSection } from "@/server/settings/store";
import type { PlacementId } from "./placements";

/**
 * Central advertising placement manager. Every page asks it where ads may go; the browser-side
 * guard in <AdSlot> then enforces the same rules against the real layout (distance in pixels,
 * maximum per screen size, one instance per placement). Values come from Admin → Settings →
 * Ad placements and are clamped so no configuration can stack or crowd ads.
 */
export type AdPage = "home" | "listing" | "browse";

export interface AdPolicy {
  /** Most ads one page may show, by page type. */
  max: Record<AdPage, number>;
  /** Most ads on a phone-sized screen (< 768 px), whatever the page. */
  maxMobile: number;
  /** Minimum vertical distance between two ads in the page (CSS px). */
  minSpacingPx: number;
  /** Content sections that must separate two ads in a feed. */
  minSectionsBetween: number;
  mobile: boolean;
  desktop: boolean;
}

const clamp = (n: number, lo: number, hi: number, dflt: number) => (Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt);

export async function adPolicy(): Promise<AdPolicy> {
  const s = await getSection("ads");
  return {
    max: { home: clamp(s.num("maxAdsHome"), 1, 4, 3), listing: clamp(s.num("maxAdsListing"), 1, 3, 3), browse: clamp(s.num("maxAdsBrowse"), 1, 2, 1) },
    maxMobile: clamp(s.num("maxAdsMobile"), 1, 3, 2),
    minSpacingPx: clamp(s.num("minSpacingPx"), 400, 2000, 700),
    minSectionsBetween: clamp(s.num("minSectionsBetween"), 1, 6, 2),
    mobile: s.bool("mobileAds"),
    desktop: s.bool("desktopAds"),
  };
}

/** The homepage feed slot kinds, in order of preference. "banner" = the responsive banner position. */
export type FeedSlot = PlacementId | "banner";

/**
 * Where ads go in a feed of `sections` content sections: never before the first section, never two
 * without `minSectionsBetween` sections between them, never after the last section (the page ends
 * with real content), and at most `max` of them, each placement used once.
 */
export function feedPositions(sections: number, max: number, minSectionsBetween: number, order: FeedSlot[]): Map<number, FeedSlot> {
  const out = new Map<number, FeedSlot>();
  const gap = Math.max(1, minSectionsBetween);
  let next = 1; // after the 2nd section (index 1)
  for (const slot of order) {
    if (out.size >= max || next >= sections - 1) break;
    out.set(next, slot);
    next += gap + 1;
  }
  return out;
}
