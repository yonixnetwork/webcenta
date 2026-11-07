import { recordListingEvent } from "./events";

/** Internal surfaces allowed in the `surface` field (never free text). */
export const SURFACES = ["detail", "card", "search", "home", "category", "collection", "alternatives", "unknown"] as const;
export type Surface = (typeof SURFACES)[number];

export function parseSurface(v: unknown): Surface {
  return (SURFACES as readonly string[]).includes(String(v)) ? (v as Surface) : "unknown";
}

/**
 * Records an outbound click ("Visit website"). This counts clicks only — it does
 * not and cannot measure registrations or purchases on the destination site.
 * Bots are not recorded; repeat clicks within 30 minutes count once.
 */
export async function recordOutboundClick(listingId: string, h: Headers, surface: Surface): Promise<boolean> {
  return recordListingEvent(listingId, "OUTBOUND_CLICK", h, { surface });
}
