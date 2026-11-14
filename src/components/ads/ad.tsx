import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { resolvePlacement, type PlacementId } from "@/server/ads/placements";
import { adPolicy, type AdPage } from "@/server/ads/manager";
import { AdSlot, type AdGuard } from "./ad-slot";

async function guardFor(page: AdPage): Promise<AdGuard> {
  const p = await adPolicy();
  return { minSpacingPx: p.minSpacingPx, maxMobile: p.maxMobile, maxPage: p.max[page], mobile: p.mobile, desktop: p.desktop };
}

async function consented() {
  return Boolean(parseConsent((await cookies()).get(CONSENT_COOKIE)?.value)?.ads);
}

/**
 * Server side of an ad placement: decides whether an ad may appear (placement switched on, a
 * provider configured, the visitor accepted advertising cookies) and which provider fills it.
 * The placement manager's rules travel with it and are enforced again in the browser.
 */
export async function Ad({ placement, page, className, compact }: { placement: PlacementId; page: AdPage; className?: string; compact?: boolean }) {
  if (!(await consented())) return null;
  const r = await resolvePlacement(placement).catch(() => null);
  if (!r) return null;
  const guard = await guardFor(page);
  return <AdSlot placement={r.id} unit={r.unit} width={r.width} height={r.height} minWidth={r.minWidth} maxWidth={r.maxWidth} provider={r.provider} adsense={r.adsense} adsterra={r.adsterra} className={className} guard={guard} compact={compact} />;
}

/**
 * The responsive banner position: 320 × 50 on phones, 468 × 60 on tablets, 728 × 90 on desktops.
 * One position, so at most one of the three ever loads (each is limited to its width range by CSS
 * and by the guard), and the guard counts it as one ad.
 */
export async function AdBanner({ page }: { page: AdPage }) {
  if (!(await consented())) return null;
  return (
    <div className="flex justify-center" data-ad-position="banner">
      <Ad placement="mobile-compact" page={page} />
      <Ad placement="desktop-small" page={page} />
      <Ad placement="desktop-leaderboard" page={page} />
    </div>
  );
}
