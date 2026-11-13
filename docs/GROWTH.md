# Webcenta — store layout, age rules, cookies, push notifications and automatic imports

Everything here uses free services only. Paid integrations are switched off (see §7).

## 1. Store-style layout
Phones: category chips at the top (Top charts, Categories, then categories), a swipeable featured carousel,
App Store-style rows, and a floating rounded tab bar (Today, Categories, Games, Search, You). Search lives in
the tab bar; the large search box only appears on wider screens.

**Update notice.** Every build has an id. An open page compares it with `/api/version` (on focus and every
10 minutes) and shows "Webcenta has been updated — Reload"; the button clears this site's caches and loads the
new version. Service-worker updates use the same banner.

## 2. Categories
`src/server/catalog/taxonomy.ts` (58 top-level categories, about 370 in total). Base data has a version
(`BASE_SEED_VERSION`): raising it re-runs the idempotent seed once at startup on every installation. New
categories are added; an administrator's edits are never overwritten.

Adult content, forex, crypto exchanges/DEX/DeFi and dating are **18+**: hidden from visitors and from users who
are not adults, always reviewed by a moderator. Gambling and token launchpads stay hidden until legal review.

## 3. Age
Sign-up asks for a date of birth (minimum age 13). Google/GitHub sign-ups are asked once after signing in. The
date is never shown, can be set once, and caps what the account sees: under 13 → all-ages, 13–15 → 13+,
16–17 → 16+, adults → 18+ (age of majority by country where it is not 18). It is self-declared, **not** identity
verification.

## 4. Cookies and policies
A consent dialog appears on first visit. Google Analytics and AdSense load only after "Accept all" or the
matching choice; "Cookie settings" in the footer reopens it. Terms, Privacy, Cookie, Content, Developer and
Review policies are published from `src/server/setup/legal-texts.ts`; edit and publish new versions in Admin →
Settings → Ranking, announcements & legal. They describe what the application does; have a lawyer review them.

## 5. Contact & support
Each message is stored as a support case **and** emailed to the support inbox (Admin → Settings → Notifications →
Support inbox, or `SUPPORT_INBOX_EMAIL`). It is sent from the From address (noreply@webcenta.com) with Reply-To
set to the visitor, so replying in Gmail answers them. Needs working SMTP (`SMTP_PASSWORD`).

## 6. Push notifications
Standard web push (VAPID). The key pair is generated on first use and stored encrypted; nothing to configure and
no cost. Visitors turn notifications on from the banner or Account → Notifications; no account is needed.
Admin → **Push notifications** sends a title, message and a Webcenta page to every subscribed device, in batches.

Requirements: HTTPS (already), the visitor's permission, and on iPhone/iPad iOS 16.4+ with Webcenta added to the
Home Screen. Works in Chrome, Edge, Firefox, Samsung Internet and Safari (macOS).

## 7. Automatic imports
Admin → **Import web apps**: paste addresses, choose a category, and optionally import one immediately. The
scheduled job (`imports.run`) imports a few queued apps every interval (Settings → Automatic web app imports:
interval, apps per run, auto-publish, screenshots).

For each app Webcenta reads what the website publishes about itself: title/description, icons, web app manifest
(name, icons, screenshots), social preview image and policy links; optionally a screenshot from WordPress.com
mShots (free, no key, unofficial — can be turned off). Images are validated and re-encoded like uploads. The
listing then goes through the normal checks: it is published automatically only when every check passes, the
category is low-risk and auto-publish is on; otherwise it waits in Submissions.

`src/server/importer/catalogue.ts` is a researched starter list (about 1,100 well-known web apps, up to 20 per
category). It is queued once and imported gradually. Adult content and gambling are never queued automatically.
Imports need an administrator account to exist and the cron job to be running.

## 8. Security checks (free)
In addition to the existing checks (DNS, HTTPS, redirects, phishing and impersonation heuristics, downloads,
change detection, the Webcenta blocklist and URLhaus):
- **Cloudflare malware filter** (1.1.1.2 over DNS-over-HTTPS): fails a domain Cloudflare blocks.
- **Domain age** (public RDAP): warns for domains younger than 30 days.
- **Privacy policy**: found on the homepage when not given; must be reachable, read like a privacy policy,
  mention the website, and be hosted on its domain (or a known policy host).
Listings are re-scanned on a schedule by risk tier (daily to weekly); a failed re-scan raises an alert and can
restrict the listing.

## 9. Switched off because they cost money
Apple sign-in (US$99/year), Google Web Risk, VirusTotal (commercial licence), Plausible, Stripe, PayPal, and the
developer "Plans & promotion" page. They are hidden and inactive; remove `paid` from the section in
`src/server/settings/registry.ts` to bring one back.
