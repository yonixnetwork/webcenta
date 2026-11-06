import { db } from "@/server/db";
import { env } from "@/lib/env";
import { clientIp, normalizeCountry } from "@/server/viewer";
import { dailySalt, deviceFromUserAgent, visitorHash } from "./visitor";

/** Internal surfaces allowed in the `surface` field (never free text). */
export const SURFACES = ["detail", "card", "search", "home", "category", "collection", "alternatives", "unknown"] as const;
export type Surface = (typeof SURFACES)[number];

export function parseSurface(v: unknown): Surface {
  return (SURFACES as readonly string[]).includes(String(v)) ? (v as Surface) : "unknown";
}

/**
 * Records an outbound click ("Visit website"). This counts clicks only — it does
 * not and cannot measure registrations or purchases on the destination site.
 */
export async function recordOutboundClick(listingId: string, h: Headers, surface: Surface): Promise<void> {
  const e = env();
  const ua = h.get("user-agent");
  const salt = await dailySalt();
  await db.listingEvent.create({
    data: {
      listingId,
      type: "OUTBOUND_CLICK",
      visitorHash: visitorHash(salt, clientIp(h, e.TRUSTED_PROXY_HOPS), ua, listingId),
      countryCode: normalizeCountry(h.get(e.GEO_COUNTRY_HEADER)),
      device: deviceFromUserAgent(ua),
      surface,
    },
  });
}
