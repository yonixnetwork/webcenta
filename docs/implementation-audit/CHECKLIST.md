# Webcenta — marketplace UI/UX, mobile, SEO, notifications and admin upgrade

Implementation checklist. Status: ☐ to do · ◐ in progress · ☑ done and tested · ✗ not possible here (reason given).
Baseline: branch `claude/youthful-cerf-4xclco` from `main` at `a2a254b` (PR #9). Screenshots: `screenshots/before/` and `screenshots/after/`.

## 0. Working features that must keep working
Public marketplace, sign-up/sign-in (email, Google, GitHub), account & profile, favourites/collections/reviews,
reports & appeals, developer portal (developers.), admin portal (admin., password + TOTP), subdomain routing,
settings store, cron jobs, PWA/offline, imports, push, age rules, cookie consent. Guarded by the existing
unit/DB tests (309) and E2E suites (journeys, desktop, tablet, mobile).

## 1. Homepage
- ☐ Editorial featured cards (logo, name, description, category, rating if real, pricing, action, verified only if verified)
- ☐ Rails: trending, popular, new, recently updated, recommended, popular categories, games, AI, productivity, developer tools
- ☐ Desktop: balanced grids/editorial layout; phones: swipeable rows
- ☐ Natural recommendation labels; general popularity labelled as such
- ☐ No invented ratings, prices, reviews or popularity

## 2. Visit counters
- ☐ Public "N+ visits through Webcenta" milestones (500+, 1K+, 5K+, 10K+, 50K+, 100K+, …) from unique outbound clicks
- ☐ Excludes bots, rapid repeats (30-min dedupe, daily unique), the listing's own developers, admin/developer previews, scans, retries
- ☐ Admin: views, unique viewers, outbound clicks, unique outbound clicks, CTR, most viewed/visited, trends, country/device
- ☐ Developers: aggregate stats for their own apps only (existing)

## 3. Account drawer
- ☐ Bottom sheet on phones, anchored panel on larger screens; overlay (no layout shift); Escape/backdrop/close; focus trap; scrolls inside
- ☐ Profile, settings, saved, collections, reviews, notifications, personalisation, security, sign out; Lucide icons

## 4. Responsive
- ☐ No horizontal overflow at 320–1920 px on every public page
- ☐ Category chips/tabs never overlap (crypto subcategories)
- ☐ Desktop layouts use the width (grids, max widths)

## 5. Bottom navigation
- ☐ Fixed to the viewport, outside scrolling content, safe-area aware, viewport-fit=cover, stable when drawers open
- ☐ Tabs: Today, Games, Apps, Saved, Search (no duplicate Categories tab); /apps excludes games

## 6. Login & registration
- ☐ After sign-in → homepage (or the page the user intentionally came from)
- ☐ Show/hide password on sign-in, sign-up, confirm, reset, change password (and admin forms)

## 7. PWA update
- ☐ One build id per deployment (no per-worker ids), compared with /api/version; banner only for a newer build; loop guard

## 8. Notifications
- ☐ Permission prompt at a suitable moment, "Not now" respected, never forces the native prompt again; iOS install note
- ☐ Notification centre: unread count, list, read/unread, mark one/all, delete, links
- ☐ Push to a user also appears in their notification centre (single `notify()` path)
- ☐ Events: new app in interests, saved app updated, announcements, security, developer status
- ☐ Inactivity reminder (≈2 days) with opt-out, frequency limits, cron-based
- ☐ User preferences; admin settings (enable, templates, limits), preview, delivery log

## 9. Public content & admin privacy
- ☐ No internal hostnames, routes, config names, procedures or thresholds on public pages
- ☐ Policies: privacy, terms, acceptable use, reviews, submission guidelines, verification, reporting & appeals, advertising
- ☐ Admin: auth + roles + MFA (existing), noindex/nofollow + X-Robots-Tag, not in sitemap

## 10. SEO
- ☐ Unique titles/descriptions, canonical, OG/Twitter with real images, SoftwareApplication JSON-LD (no invented data)
- ☐ Sitemap: public listings/categories/policies with lastmod; excludes private/draft/18+ gates; search pages noindex

## 11. Bulk import & publishing
- ☐ Select, preview, edit, bulk publish/reject/archive/re-categorise, publish all eligible, send for review, exclude
- ☐ Risk-based auto-publishing with configurable categories, threshold, limits; audit trail of decisions
- ☐ No invented details (pricing not guessed)

## 12–14. Cards, visual design, accessibility
- ☐ Consistent cards with real data only; Lucide icons; focus states; accessible names; touch targets

## 15–16. Verification
- ☐ lint, tsc, build, DB checks, unit/DB tests, E2E (all projects), responsive checks, console errors
- ☐ Screenshots at 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080
- ✗ Real iPhone/Android/installed-PWA testing: not available here (Chromium emulation only)

## 17. Deployment
- ☐ PR, CI green, merge, Hostinger auto-deploy, runtime logs
