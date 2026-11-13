# Advertising — Adsterra units, AdSense priority, placements

## Where it is configured (one system)

Admin → Settings → **Advertising** now has three sections, all in the same settings service as before:

* **Google AdSense** (existing): publisher ID, Auto ads, ads.txt.
* **Adsterra** (new): on/off, ad server host (`bauval.org`) and the six unit keys, pre-filled with the supplied codes, plus *Frame isolation*.
* **Ad placements** (new): placements on/off, preferred provider, "My AdSense site and ad units are approved", and an optional AdSense unit ID per placement.

## The six units (unchanged IDs, keys, domain and sizes)

| Unit | Key / ID | Script |
|---|---|---|
| Native Banner | `2551bb0538e1d6f96d5844f91de7e70d` | `https://bauval.org/21/<id>` + `<div id="container-<id>">` |
| 468 × 60 | `c48a5f48afbd920b94c779e34cbe26f8` | `atOptions` + `https://bauval.org/22/<key>` |
| 300 × 250 | `71f63cdca7866f4ff5d8f2c07764ccdd` | 〃 |
| 160 × 600 | `8f136dfb344bddf64040a81be40b2730` | 〃 |
| 728 × 90 | `f66f57ed50fa3f1c7686f5fda2f6b167` | 〃 |
| 320 × 50 | `ce450a64b7d6fcc6866e4901d5e8153b` | 〃 |

The E2E test fetches every frame and compares it with the supplied code character for character.

## How one unit is rendered (isolation)

The supplied codes share the global `atOptions`, and placing several on one page lets the last one overwrite the others. So **each placement is its own document**:

```
page ── <aside aria-label="Advertisement"> "Advertisement" label + reserved box
          └─ <iframe src="/ads/frame/300x250" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox">
               └─ exactly the supplied code for that one unit (its own atOptions)
```

* `/ads/frame/<unit>` serves only units configured in Settings. Keys must be 32 hex characters and the host a plain host name, so no other script can be injected and listing content never reaches it. It sends its own Content-Security-Policy (the ad network loads scripts and frames from changing hosts), `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`. The **page's own strict CSP is unchanged**; only `frame-src 'self'` is kept explicit.
* **Sandboxed.** The ad cannot read Webcenta's DOM or cookies, cannot navigate or redirect the page (no `allow-top-navigation`), and clicks open in a new tab. If sandboxed units stay empty because a network refuses sandboxed frames, switch *Frame isolation* to *Standard* (adds `allow-same-origin`).
* **Loaded once per placement and page view**, only when the placement is near the viewport (IntersectionObserver), and only if the screen is wide enough. React re-renders never reload it; leaving the page removes it. A native unit reports its height to the page (postMessage, checked against the frame), so the reserved box fits.
* **Failures never break the page.** A blocked or failed provider collapses the box or leaves it empty. Failures are reported to `/api/ads/log` (placement, provider, reason; rate-limited) and written to the server log. No secrets are involved.
* Service worker: `/ads/*` is never cached.

## Provider selection (deterministic, one provider per placement)

1. **AdSense** when: the AdSense section is enabled with a publisher ID, *and* "My AdSense site and ad units are approved" is ticked, *and* the preferred provider is AdSense, *and* the placement has an AdSense unit ID. Entering a publisher ID alone never activates AdSense units.
2. Otherwise **Adsterra** (if enabled).
3. In the browser, an AdSense unit that is unfilled (`data-ad-status="unfilled"`) or whose script is blocked is replaced by the placement's Adsterra unit, once. The two never show at the same time.

The decision is made on the server per request from settings, so it does not flip between renders.

## Placements

| Placement | Unit | Shown at | Where |
|---|---|---|---|
| Homepage native | Native | all widths | after the 2nd homepage section |
| Homepage display | 300 × 250 | all widths | after the 4th homepage section |
| App page | 300 × 250 | all widths | below the description and features, above reviews, with a divider |
| Mobile compact | 320 × 50 | < 500 px | after results on search, category and Apps pages |
| Smaller banner | 468 × 60 | 500–1023 px | same position |
| Desktop leaderboard | 728 × 90 | ≥ 1024 px | same position |
| Desktop sidebar | 160 × 600 | ≥ 1280 px | bottom of the app page sidebar (sticky) |

The three banner sizes share one position, so each screen gets exactly one banner there and a 728 or 160 unit never loads on a phone (E2E tested at 390 and 1440 px).

Never on sign-in, registration, account or profile forms, developer or admin portals, or the leaving-Webcenta page. Ads sit **between** whole sections, never inside a row of app cards, and are always labelled "Advertisement". The fixed tab bar stays above them (z-index). Reserved space reduces layout shift.

## Consent and policies

* Ads load only after a visitor accepts **advertising cookies** in the cookie banner (the same rule as AdSense). Visitors who decline or have not answered see no ads. This is the conservative, compliant choice, and it also reduces impressions.
* The Cookie Policy, Privacy Policy and the Advertising policy name Adsterra. The Advertising policy says ads are labelled, never styled as listings, and that pop-under/redirect formats are not used. Policies stored in the database at first setup keep their old text until republished in Admin → Settings → Content.
* **Not enabled:** Popunder, Smartlink, Social Bar, interstitials and any other intrusive format (not supported at all).

## Owner actions in the Adsterra dashboard (cannot be done from code)

1. Under *Websites → webcenta.com*, block **adult**, gambling and other unsuitable ad categories, and turn off any "aggressive/anti-adblock" options.
2. If Adsterra asks for an ads.txt line, add it in Admin → Settings → Google AdSense → *Extra ads.txt lines* (served at `/ads.txt`).
3. Check revenue and fill after a day. If sandboxed units never fill, try *Frame isolation → Standard*.

## AdSense later

When Google approves webcenta.com: create display units in AdSense (300×250, 728×90, 468×60, 320×50, 160×600, and an in-feed/display unit for the homepage), enter their numeric `data-ad-slot` IDs in Settings → Ad placements, tick *approved*, and keep the preferred provider on AdSense. The CSP then allows Google's ad servers on those pages automatically.
