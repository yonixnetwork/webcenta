# Webcenta — marketplace UI/UX, mobile, SEO, notifications and admin upgrade

Implementation checklist. Status: ☑ done and tested · ◐ done, partly verifiable here · ✗ not possible here (reason given).
Baseline: `main` at `a2a254b` (PR #9). Work branch: `claude/youthful-cerf-4xclco`.
Screenshots: [`screenshots/before/`](screenshots/before) (unchanged `main`) and [`screenshots/after/`](screenshots/after),
captured by `tests/e2e/audit-screens.spec.ts` (run with `AUDIT_SHOTS=before|after`) in Chromium emulation.

## 0. Working features that must keep working
Public marketplace, sign-up/sign-in (email, Google, GitHub), account & profile, favourites/collections/reviews,
reports & appeals, developer portal, admin portal (password + TOTP), subdomain routing, settings, cron jobs,
PWA/offline, imports, push, age rules, cookie consent. Guarded by the unit/DB tests and the E2E suites
(journeys, desktop, tablet, mobile), which all run against the production standalone build.

## 1. Homepage — ☑
- ☑ Featured carousel cards: real logo (or monogram), name, description, category, rating only if rated, pricing only if known, visit milestone only if reached, verified only if the developer is verified, View action
- ☑ Rails from real data only: featured, editor's picks, trending, popular, highly rated (minimum ratings), new, recently updated, category rails (AI, productivity, developer tools, education, games — admin-configurable), collections
- ☑ Honest subtitles ("Most viewed and visited on Webcenta (not personalised)")
- ☑ "Popular categories" ranked by the real number of published apps
- ☑ Recommendations: "Recommended for you", "Popular in your interests", "You might like these", "Based on your saved apps", "Discover more apps"; an app appears in only one personal rail (unit test)
- ☑ Phones: swipeable columns; tablets/desktop: 2–3 column grids within `max-w-7xl`

## 2. Visit counters — ☑
- ☑ Public "500+ / 1K+ / 5K+ / 10K+ / 50K+ / 100K+ / 500K+ / 1M+ visits" (only reached milestones) on cards and "… through Webcenta" on the app page (unit test)
- ☑ Source: unique outbound clicks (sum of daily uniques), stored in `Listing.visitCount` by the 15-minute roll-up (DB test)
- ☑ Not counted: bots (user agent), repeats within 30 minutes, the listing's own developers (DB test), admin/developer portals (no tracking there), scans (server-side, no /go), retries (dedupe)
- ☑ Privacy: daily-rotating keyed hash per listing; no IPs or identities stored or shown
- ☑ Public wording: "visits through Webcenta" with an explanation; never claims the website loaded
- ☑ Admin analytics: views, unique viewers, outbound clicks, unique outbound clicks, CTR, most viewed, most visited, trends chart (4 series), countries, devices (small buckets merged)
- ☑ Developers keep aggregate stats for their own apps only (existing)

## 3. Account drawer — ☑
- ☑ Bottom sheet on phones, anchored panel from `sm`; rendered in a portal with `position: fixed` (no layout shift — E2E asserts the tab bar position and page width are unchanged)
- ☑ Escape, backdrop and close button; focus moves in and is trapped; content scrolls inside (`max-h-[85dvh]`)
- ☑ Profile & settings, Security, Saved apps, Collections, My reviews, Notifications (unread badge), Personalisation & privacy, Recently viewed, My reports, Developer portal, Sign out — Lucide icons

## 4. Responsive — ☑
- ☑ **Root cause of the "tab bar pushed sideways" bug found and fixed**: off-screen columns of horizontally scrolling rows contained `sr-only` text positioned relative to the page, widening the document by ~80 px once apps had ratings. Horizontal scrollers are now a positioning context; `html, body { overflow-x: clip }` as a second guard; `scrollbar-gutter: stable`
- ☑ Large "Discover" title no longer overlapped by the category chips (negative margin removed)
- ☑ Chips/tabs never wrap or overlap (`whitespace-nowrap`, scrollable rows), including crypto subcategories
- ☑ Headings scale down on phones and break long words
- ☑ No horizontal overflow on any audited page at 9 viewports (audit spec reports overflow; E2E responsive suites)

## 5. Bottom navigation — ☑ (◐ real iOS)
- ☑ `position: fixed` on the viewport, outside the content, `translateZ(0)`, safe-area aware (`env(safe-area-inset-bottom)`); `viewport-fit=cover`; header padded with `env(safe-area-inset-top)`; footer padded so content is never hidden
- ☑ Tabs: Today, Games, Apps, Saved, Search (Categories tab removed; categories stay in the chips and /categories)
- ☑ New `/apps` page: categories and rails without games
- ◐ Installed iOS PWA and Safari behaviour: emulated only (no physical iPhone in this environment)

## 6. Login & registration — ☑
- ☑ Sign-in and sign-up default to the homepage; e-mail confirmation lands on `/?welcome=1`; a safe `next` the user asked for is honoured (journeys), unsafe ones ignored (security test)
- ☑ Show/hide password (eye / eye-off, `aria-pressed`, keyboard accessible, hidden by default) on sign-in, sign-up, confirm, reset, change password, admin sign-in and admin invitation

## 7. PWA update — ☑
- ☑ Root cause: the build id came from `Date.now()` in `next.config.ts`, evaluated separately by build workers, so pages and server could disagree within one deployment → endless "update" banner
- ☑ Now Next.js's single `.next/BUILD_ID` (read by the server for both the page and `/api/version`); banner only for a genuinely different build; Reload clears caches and activates the waiting worker; a per-session loop guard prevents repeated prompts for the same build (E2E)
- ◐ iOS Safari / installed PWA / Android: emulated Chromium only

## 8. Notifications — ☑ (◐ real devices)
- ☑ One path: `notify()` writes the in-app notification and pushes to the user's devices (with limits), so every push is also in the notification centre; announcements are mirrored into signed-in recipients' centres
- ☑ Notification centre: unread count, list, title, message, relative time, read/unread, mark one/all, delete, links (E2E)
- ☑ Preferences: new apps, saved-app updates, announcements, reminders, push copies, email (E2E)
- ☑ Events: new app in interests (≤1/day), saved app updated (≤1/week/app), announcements, security notice on password reset, developer listing status (existing) (DB tests)
- ☑ Inactivity reminder: push users away ≥2 days, only when new apps exist, ≤1 per 7 days and never twice without a visit; opt-out respected (DB test); cron job every 6 h (Hostinger cron)
- ☑ Permission prompt only after a few page views, wording as requested, "Not now" snoozes 14 days and stops after two declines; the native prompt is shown only after "Enable"; iOS without Home Screen install shows the install requirement instead
- ☑ Admin: settings (enable, limits, templates), announcement preview, delivery log by type with accepted/failed counts ("accepted by the push service", not "delivered")
- ◐ Real push delivery to devices cannot be tested here (no browser push service access)

## 9. Public content & admin privacy — ☑
- ☑ No internal hostnames, routes, settings names or procedures on public pages (reviewed; only code comments mention them)
- ☑ Policies index `/legal` + new Acceptable Use, App Submission Guidelines, Listing Verification, Reporting and Appeals, Advertising and Sponsored Placements; existing Terms, Privacy, Cookie, Content, Review, Developer
- ☑ Admin portal: authentication, roles, MFA (existing); `X-Robots-Tag: noindex, nofollow` on admin and developer hosts, admin robots.txt `Disallow: /`, noindex metadata (E2E)
- ☑ Public robots.txt also disallows account, sign-in and similar pages (they are noindex too)

## 10. SEO — ☑
- ☑ Listing pages: unique title and description (summary, category, publisher), canonical, Open Graph and Twitter with the app's real screenshot/logo, `WebApplication` JSON-LD (a SoftwareApplication type) with image/screenshots/mainEntityOfPage; price only for genuinely free apps, rating only when real (E2E)
- ☑ Sitemap: listings (content-update date), categories except 18+ gates, /apps, policies; excludes private routes, drafts, rejected/suspended, samples (E2E)
- ☑ Search pages noindex; no query-generated indexable pages
- ◐ Search Console/Bing submission is an owner action (Admin → Settings → Search engines provides verification tags and IndexNow)

## 11. Bulk import & publishing — ☑
- ☑ Import table with select-all and bulk actions: publish selected, publish all eligible, send for review, reject, archive, exclude, move to category, import now; preview & edit links (DB test: only eligible imports are published)
- ☑ Risk-based automatic publishing: no failed check, an external malware source checked the site, risk score ≤ threshold, category allowed and not sensitive, not marked for review, no open reports, logo and enough self-description (unit tests)
- ☑ Settings: enable, confidence threshold, eligible categories, always-review categories, bulk limit, catalogue source on/off; duplicate detection by domain (existing)
- ☑ Audit trail: `imports.auto-publish` / `imports.review-required` with the risk score and reasons; bulk actions audited
- ☑ Pricing is no longer guessed for imports ("See website" until set)

## 12–14. Cards, visual design, accessibility — ☑
- ☑ One `AppMeta` line on rows and featured cards; grid cards hide unknown pricing; Lucide icons throughout the new UI
- ☑ Accessible names for icon buttons (drawer, notification actions, password toggle), focus management, keyboard support, touch targets ≥ 36 px

## 15–16. Verification
- ☑ lint, tsc, production build, migrations (fresh database equals the schema), unit/DB tests, E2E on the standalone build — see the final report for counts
- ☑ Screenshots at 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080
- ✗ Physical iPhone/Android devices and installed-PWA mode: not available here (Chromium device emulation only)
- ✗ The live website cannot be opened from this environment (network policy); the deployment is verified through Hostinger's build and runtime logs

## 17. Deployment
- PR → CI → merge → Hostinger auto-deploy → runtime logs (see the final report)
