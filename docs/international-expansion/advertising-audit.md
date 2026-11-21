# Advertising audit

## Placements on app pages
Before: up to three units, including a compact native unit directly inside a "Ready to try …?" box with a second visit button, and a unit after the reviews at the bottom of the page.
Now: at most **two** — `listing` between the app's details and the reviews (well below the single "Visit Official Website" button) and `desktop-sidebar` on screens ≥ 1280 px. Enforced three times: page markup, the manager's per-page maximum (setting capped at 2) and the browser guard. The `listingNative` toggle is kept for compatibility but unused.

## Controls Webcenta enforces
| Control | Where |
|---|---|
| Ads only after advertising consent | `Ad` component |
| No ads on app pages in blocked categories (gambling, betting, adult, dating, crypto/forex/high-risk finance, weapons/drugs/tobacco/alcohol, political/religious) or rated 18+ | Settings → Ad content policy, `src/server/ads/content-policy.ts` |
| No ads for a country, or no AdSense / no Adsterra for a country | Admin → Country policies |
| No ads when the country is unknown (optional) | Ad content policy |
| One provider per slot: AdSense when approved, else Adsterra; never both | `resolvePlacement` |
| Sandboxed frames; banner and native formats only (no popunder, Smartlink, Social Bar) | `/ads/frame/<unit>` |
| Placement limits, spacing, phone/desktop switches | Settings → Ad placements |
| Report this ad → admin review | `/report-ad`, Admin → Ad reports & policy |

The frame endpoint applies the same country rules, so opening a frame URL directly does not bypass them.

## What depends on the providers (Webcenta cannot do it)
Webcenta cannot see the creative inside an ad frame (cross-origin, sandboxed) and cannot filter it.
- **Google AdSense**: Blocking controls → Content (sensitive and general categories) and Advertiser URLs. Apply every blocked category and the blocked-advertiser list there.
- **Adsterra**: category and advertiser filtering is handled by Adsterra (publisher dashboard options and account manager / support). Ask them to apply the categories in Ad content policy to webcenta.com and send the blocked-advertiser list. Webcenta does not claim that Adsterra filters every category.
- Record the date of each check in Ad content policy; the Ad reports page shows it as a checklist.

Therefore no claim is made that advertising is fully controlled: Webcenta controls where ads appear and for whom; the providers control which ads are served.

## Fast response
Admin → Ad reports & policy links to switching a placement off, turning Adsterra off and the country policies. Reports store page, placement, provider, reason, description and country code (no IP); they are deleted after 12 months.
