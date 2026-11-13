import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { resolvePlacement, type PlacementId } from "@/server/ads/placements";
import { AdSlot } from "./ad-slot";

/**
 * Server side of an ad placement: decides whether an ad may appear (placement switched on, a
 * provider configured, the visitor accepted advertising cookies) and which provider fills it.
 */
export async function Ad({ placement, className }: { placement: PlacementId; className?: string }) {
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  if (!consent?.ads) return null;
  const r = await resolvePlacement(placement).catch(() => null);
  if (!r) return null;
  return <AdSlot placement={r.id} unit={r.unit} width={r.width} height={r.height} minWidth={r.minWidth} maxWidth={r.maxWidth} provider={r.provider} adsense={r.adsense} adsterra={r.adsterra} className={className} />;
}
