import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { resolvePlacement, type PlacementId } from "@/server/ads/placements";
import { adPolicy, type AdPage } from "@/server/ads/manager";
import { AdSlot, type AdGuard } from "./ad-slot";
import { adsAllowedForContent, type AdContentContext } from "@/server/ads/content-policy";
import { combineRules, countryRules } from "@/server/geo/country-policy";
import { viewerCountry } from "@/server/viewer";
import { getSection } from "@/server/settings/store";
import { getT } from "@/i18n/server";

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
/**
 * Country and content rules for advertising: no ads for countries switched off in Admin →
 * Country policies (or when the country is unknown, if the ad content policy says so), and only
 * the providers allowed there. Restrictions of the detected and the chosen country both apply.
 */
export async function adEligibility(content?: AdContentContext): Promise<{ allowed: boolean; disabledProviders: string[] }> {
  if (!(await adsAllowedForContent(content))) return { allowed: false, disabledProviders: [] };
  const [{ detected, chosen }, policy] = await Promise.all([viewerCountry(), getSection("adPolicy")]);
  if (!detected && policy.str("unknownCountryAds") === "deny") return { allowed: false, disabledProviders: [] };
  const rule = combineRules(await countryRules(), [detected, chosen]);
  return { allowed: !rule.adsDisabled, disabledProviders: rule.disabledProviders };
}

export async function Ad({ placement, page, className, compact, content }: { placement: PlacementId; page: AdPage; className?: string; compact?: boolean; content?: AdContentContext }) {
  if (!(await consented())) return null;
  const eligible = await adEligibility(content).catch(() => ({ allowed: false, disabledProviders: [] }));
  if (!eligible.allowed) return null;
  const r = await resolvePlacement(placement, { disabledProviders: eligible.disabledProviders }).catch(() => null);
  if (!r) return null;
  const [guard, t] = await Promise.all([guardFor(page), getT("common")]);
  return <AdSlot placement={r.id} unit={r.unit} width={r.width} height={r.height} minWidth={r.minWidth} maxWidth={r.maxWidth} provider={r.provider} adsense={r.adsense} adsterra={r.adsterra} className={className} guard={guard} compact={compact}
    labels={{ ad: t("ads.label"), report: t("ads.report") }} page={page} />;
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
