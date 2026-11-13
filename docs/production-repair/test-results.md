# Production repair — test results

All runs are local unless stated otherwise: MariaDB 10.11, the production standalone build (`node .next/standalone/server.js`, exactly what Hostinger runs) and Chromium (Playwright). CI repeats lint, type check, build, unit/DB tests and E2E on GitHub Actions for every push.

## Static checks and build

| Check | Result |
|---|---|
| `npm run lint` (ESLint) | ✅ 0 errors, 0 warnings |
| `tsc --noEmit` | ✅ |
| `npm run build` (webpack, standalone) | ✅; `prepare-standalone` copies `cron-tick.mjs` next to `server.js` |
| Migration `20261114120000_scheduler_push_imports_ads` | ✅ applied on top of all earlier migrations; schema diff after applying = empty |

## Unit, integration and database tests (Vitest)

**337 / 337 passed** (26 files; 320 before this work, plus 17 new).

New: `tests/db/production-repair.test.ts` (15) and `tests/unit/enrichment.test.ts` (2):

* **Scheduler:** a tick runs jobs and records result, duration and start; a failing job is recorded as DEAD with its error; an overlapping tick is skipped and recorded; the lease expires on its own; two concurrent ticks → exactly one works; paused jobs are not scheduled; Run now runs the real handler; unknown jobs are refused.
* **Push:** answer classification; subscription linked to the account and unlinked after sign-out; a replaced endpoint is removed; urgency high, TTL 24 h, payload (url, badge, tag); accepted/failed/expired attempts logged with platform; expired removed; failure count, status and category stored; diagnostics counts; a test push reaches only the asking subscription.
* **Imports:** duplicate host variants and the shared-hosting exception; queued duplicates skipped (the earliest kept); an import being processed cannot start twice; retry clears the error; fetch error categories; **two simultaneous approvals → one publish, one status change**.
* **Domain verification:** unique codes and HTML file names, TXT host labels, expiry.
* **Ads:** provider selection (a publisher ID alone → Adsterra; approved + unit ID → AdSense with Adsterra fallback; no unit ID → Adsterra; "Adsterra only"); responsive limits; placement off → none; every frame contains exactly the supplied code, one `atOptions` per frame.
* **Enrichment:** extracts the site's own paragraphs and features, ignoring navigation, cookie notices and footers; composes without invented claims; no proposal unless clearly better.

Updated: CSP expectation (`frame-src 'self' …`), developer verification methods (HTML file), configuration docs.

## End-to-end (Playwright, production build)

### New suite `tests/e2e/repair.spec.ts` — **10 / 10 passed**

| Test | What it really does |
|---|---|
| Cron command | Runs **`node .next/standalone/cron-tick.mjs`** (the exact hPanel command) against the server → `HTTP 200 run …: processed N` and a `JobRun` row with trigger `cron` and a finish time; with the lease held → "skipped: another run is in progress"; `GET` → 405; no or wrong secret → 401 |
| Scheduler page | Every job listed; **Run now** on Analytics roll-up → "stats.rollup finished in … ms"; the Job row is SUCCEEDED in MySQL |
| Import → publish | 2 fixture websites → "2 added to the queue" → re-adding (one as `www.…/`) is recognised → select, count, deselect, Publish disabled with nothing selected → **Import selected now: "Imported: 2"** → **Run security checks: "Checked: 2"** → **Publish selected: "Published: 2"** → MySQL: both PUBLISHED with exactly 1 publish event each → publishing again: "Nothing changed" → a down website: "Not imported (job #…), stage fetch" |
| Push | Subscription (Android UA) → admin announcement → "Sent to 1 device: 0 accepted by push services, 1 failed so far. Accepted does not prove a device displayed it." → `PushDelivery` row (platform android) → report visible → a test push for it is not accepted |
| Ad frames | All six `/ads/frame/<unit>` responses contain the supplied code character for character; CSP `frame-ancestors 'self'`; `X-Frame-Options: SAMEORIGIN`; unknown unit → 404; admin host → 404 |
| Ad placements | With ad consent at 1440 px: native and 300×250 on the home page, 728×90 on search, 300×250 + 160×600 on an app page; sandbox without same-origin or top-navigation; no overflow; none on sign-in/sign-up. At 390 px: 320×50 only (no 728/468/160 frames), tab bar inside the screen, no overflow. Without consent: no ads. (A non-existent ad host is used here, so tests create no impressions.) |
| Account on phones | 320 and 390 px: settings list; Profile on its own screen with "‹ Account"; no form until **Edit profile**; Security form only after **Change password**; no overflow and no tab strip on all 10 account pages; 1280 px: sidebar with the current section |
| Filters | 375 px: bottom sheet inside the screen, Open source → Apply → `openSource=1`, badge "1", Reset; 1440 px: closed bar < 60 px tall, panel ≤ 600 px |
| Google button | 320 and 1280 px, sign-in and sign-up: "Continue with Google" with the 4-colour G, white background, within the screen |
| HTML-file verification | File name `webcenta-domain-verification-<16 hex>.html`, Download button, exact address; before upload → refused; wrong code → "does not contain this verification code"; correct file → "verified" |

### Responsive audit `tests/e2e/responsive-audit.spec.ts` (opt-in) — **160 checks, 0 problems**

16 pages (home, games, apps, search, app details, sign-in, sign-up, and every account section signed in) × 10 viewports (320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080). Checks: HTTP status, horizontal overflow, elements beyond the screen, the fixed tab bar inside the screen, and **browser console and runtime errors**. Machine-readable result: [responsive-audit.json](responsive-audit.json). Screenshots: `screenshots/responsive/` (320, 390, 768, 1440) and `screenshots/` (feature evidence).

### Full regression (all projects: journeys, desktop, tablet, mobile)

* Run 1: 136 passed, 3 failed. The failures came from the new suite leaving state for later suites: the sign-up rate limit was used up by 4 extra sign-ups, the import settings were not reset, and the filter-bar locator was fragile. All three were fixed in the tests (the application was not changed to make tests pass).
* Run 2: 135 passed, 1 failed. A pre-existing race in `security.spec.ts` (SSRF domain test): the next domain was typed while the previous submission was still running and the form reset. It passes on its own (13/13). The test now waits for each submission.
* CI on the PR exposed two more problems, both fixed before merging:
  * **MySQL 8 (a real bug):** the scheduler lease compared a JSON number with `CAST(… AS UNSIGNED)`, which MySQL 8's strict mode rejects for `1.79e12` stored as a double. MariaDB accepts it, so local runs passed. The fix compares as `DECIMAL(20,0)`, and all 337 tests then passed on MySQL 8.0 locally.
  * **Sign-in rate limit:** the new suite used up the shared sign-in allowance (10 per 5 minutes), which broke a later security test on the faster CI runner. The suite now returns its allowance when it finishes.
* **Final CI on the merged head `0f8c57c`: all 6 checks green** (MariaDB 10.11 full suite including E2E, MySQL 8.0 suite, Hostinger production-only build; each twice, for push and pull request).

Existing tests updated for intended changes only: tab labels (Home, Games, Apps, Search; Saved removed), profile editing behind "Edit profile", "Check verification" button text, the import result message with job number, the filter summary locator.

## Not testable here (stated, not claimed)

* **Physical phones.** Android and iPhone notification display and an installed iOS PWA: no devices in this environment. Steps for the owner are in [notification-diagnostics.md](notification-diagnostics.md).
* **Real push services and real ad fill.** No outbound network from the test environment; a mock push service and a non-existent ad host are used.
* **Real Google OAuth round trip.**
* **Live site from this container.** The network policy blocks webcenta.com; the deployment is verified through Hostinger's API (build log, runtime log, cron output). See the deployment section below.

## Deployment and live verification

* **Merge:** [yonixnetwork/webcenta#11](https://github.com/yonixnetwork/webcenta/pull/11) merged into `main` as `e60a093`.
* **Hostinger build** `01a1d5de…`: completed (17:04–17:07 UTC). `prepare-standalone` copied `cron-tick.mjs` and wrote the environment snapshot (29 names, including `CRON_SECRET` and `PUBLIC_ORIGIN`).
* **Runtime log 17:07:13 UTC:** `auto-migrate: Applied 1 migration(s): 20261114120000_scheduler_push_imports_ads`, then "database is up to date". No errors.
* **Hostinger cron job created** through the Hostinger API (uid `qHmggYwnPu`): `*/5 * * * *` → `/opt/alt/alt-nodejs22/root/usr/bin/node /home/u658485007/domains/webcenta.com/hbuilds/current/nodejs/cron-tick.mjs`. Before this there was no cron job for webcenta.com at all.
* **First real production run (cron output, 17:35 UTC):** `webcenta cron: HTTP 200 run 01a1d5fa…: processed 54, failed 0, enqueued 13, recovered 0, 15661 ms`. Runtime log: `[webcenta] cron tick processed=54 failed=0 enqueued=13 in 15661ms`. The 54 jobs were the backlog that had accumulated while the scheduler never ran: queued security checks, email and notification jobs.
