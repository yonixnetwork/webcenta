# Final hardening — test results

Local runs: MariaDB 10.11, the production standalone build, Chromium (Playwright). GitHub Actions repeats everything (MariaDB 10.11 and MySQL 8.0) on the pull request.

| Check | Result |
|---|---|
| ESLint | ✅ 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`) | ✅ |
| Production build (webpack, standalone) | ✅ |
| Migration `20261115120000_hardening_security_events` | ✅ additive only (3 columns, 1 table); schema diff after applying = empty |
| Unit + database tests (Vitest) | ✅ **347 / 347** (27 files; 10 new in `tests/db/hardening.test.ts`, 1 updated) |
| New E2E suite `hardening.spec.ts` | ✅ **8 / 8** |
| Updated E2E suite `repair.spec.ts` | ✅ **10 / 10** (ads now checked against the placement rules) |
| Full E2E regression (journeys, desktop, tablet, mobile) | ✅ **150 passed**, 1 failed. The failure was an existing race in `hosts.spec.ts` (it waited for a URL the page already had before sign-out finished); the test now waits for the session cookie to disappear and passes 3 / 3. |
| Responsive audit (16 pages × 10 viewports, incl. the 8 requested) | ✅ **160 checks, 0 problems**: no overflow, nothing off-screen, tab bar inside the screen, no console or runtime errors ([responsive-audit.json](responsive-audit.json), images in `responsive/`) |

## What the new tests actually do

**Notifications**
* User notification page: no test button. `POST /api/push/test` returns 404.
* A user turns on notifications on two devices. In the admin, *Find devices* lists both; *Send test to this device* sends exactly **one** TEST delivery. No other delivery is created, and the audit log contains no endpoint.
* The result shows the push service's real answer (a made-up subscription is reported as not accepted).
* DB: the test push calls the push service for the chosen subscription only. Update notifications: one per meaningful update, never twice, none for tags-only updates; the developer's summary is used.

**Advertising**
* Home, search and app pages at 1440 px:
  * loaded ads ≤ the maximum, every pair ≥ 700 px apart, no overlap;
  * the compact sponsored unit sits inside the "Ready to try" box, labelled, above "Visit official website";
  * no ads on sign-in or sign-up.
* At 390 px: ≤ 2 ads, no 728 × 90, 468 × 60 or 160 × 600, the tab bar stays on screen, no overflow.
* The six Adsterra frames are byte-exact; AdSense priority (DB test).

**Security**
* E2E:
  * inviting an administrator after the confirmation window expired is refused (nothing created), refused with a wrong code, and accepted with a valid code;
  * the security dashboard shows failed admin sign-ins, activity by type and active sessions;
  * security headers (DENY, nosniff, COOP, Referrer-Policy, Permissions-Policy, CSP frame-ancestors / object-src).
* DB: step-up (missing, wrong and reused codes, the 10-minute window, failures counted towards lockout); event counting and alert-once; rate-limit recording; crawler verification (a user agent alone is not trusted).
* Existing security suite, all passing: XSS, CSRF, SSRF, IDOR, uploads, session isolation, brute force, RBAC.

**Import and moderation**
* E2E: two real imports → security checks → *Select visible* → *Approve selected*. The number of newly published listings equals exactly the number reported approved; ineligible ones are listed. *Reject* without a reason is refused.
* DB: eligibility reasons (checks not finished, failed check, missing logo, short description), bulk approve, reject and request information, suspend only published listings; clean-up deletes only old listing-less duplicates and failures, and logs them.

**SEO**
* `sitemap.xml` is valid XML (`application/xml`), contains public pages and no private paths, other hosts or sample listings.
* `robots.txt` allows the site and links the sitemap; the admin host is `Disallow: /` and `noindex`.
* Google and Bing verification files are served only when configured, with the exact content.
* An app page has its title, description, canonical URL, Open Graph and honest JSON-LD.

**Navigation**
* At 1280 px, account pages show "Back to marketplace" (works) and the breadcrumb, with no overflow. At 390 px the phone layout is unchanged.

## Screenshots (`screenshots/`)
* `admin-test-push-1440`
* `admin-step-up-1440`
* `admin-security-activity-1440`
* `admin-submissions-bulk-1440`
* `account-desktop-1280`
* `ads-home-1440`, `ads-app-1440`, `ads-search-390`

Plus the responsive set in `responsive/`.

## Not verifiable here
* Real phones, real push delivery and real ad fill: no devices or outbound network in the test environment.
* Google and Bing ownership verification: only the owner can complete it.
* The live site from this container: the network policy blocks it, so production is checked through Hostinger's API (build log, runtime log, cron output).
