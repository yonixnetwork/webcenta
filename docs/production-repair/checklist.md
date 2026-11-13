# Production repair — checklist

Status: ☑ fixed and verified · ◐ fixed, partly verifiable here (reason given) · ✗ not possible here / owner action.
Baseline: `main` at `8b824e3` (PR #10). Branch: `claude/youthful-cerf-4xclco`. Evidence: [test-results.md](test-results.md), [screenshots](screenshots/).

## 1. Adsterra integration — ☑ (◐ live ad fill)
- **Problem:** six Adsterra units to integrate; the supplied snippets share the global `atOptions`.
- **Root cause / constraint:** several snippets on one page overwrite each other, and adding them inline would mean loosening the page's strict CSP.
- **Fix:** *Adsterra* and *Ad placements* sections in the existing Admin → Settings → Advertising group. Each unit is served by `/ads/frame/<unit>` with exactly the supplied code and its own CSP, inside a sandboxed iframe: one unit per document. Seven responsive placements, lazy-loaded once per page view, with reserved space, an "Advertisement" label, and failure reporting. See [ads-setup.md](ads-setup.md).
- **Tests:** DB test (codes, keys and sizes exact; one `atOptions` per frame; disabled → no unit). E2E (all six frames byte-exact; CSP and frame headers; unknown unit and admin host → 404; sandbox without same-origin or top-navigation; placements per width; none on sign-in/sign-up; none without consent; no overflow).
- **Limitation:** real ad fill cannot be tested here (no outbound network; tests use a non-existent ad host so they never create impressions). Check fill on the live site. Category blocking (no adult ads) is set in the Adsterra dashboard.

## 2. AdSense priority and fallback — ☑
- **Fix:** AdSense only when enabled, preferred, the owner confirmed approval, and the placement has a unit ID; otherwise Adsterra. An unfilled or blocked AdSense unit falls back to Adsterra once, never both at the same time. The choice is made per request on the server (deterministic).
- **Tests:** DB test (publisher ID alone → Adsterra; approved + slot → AdSense with Adsterra fallback; placement without slot → Adsterra; "Adsterra only" overrides).
- **Limitation:** AdSense is not approved yet, so live AdSense rendering was not exercised.

## 3. Mobile push notifications — ☑ (◐ physical devices)
- **Problem:** admin notifications appeared in the in-app centre but not reliably on phones; desktop worked.
- **Root causes:** (1) normal-urgency pushes, which Android defers in Doze; (2) phone subscriptions never re-confirmed, so stale, unlinked or wrong-account subscriptions; no `pushsubscriptionchange` handling; (3) the service worker could fail to install when one precache download failed; (4) announcements beyond 100 devices depended on the scheduler, which never ran; (5) no per-attempt delivery log.
- **Fix:** high urgency + topic + TTL; browser re-sync of the subscription linked to the current account; `pushsubscriptionchange`; resilient SW install; badge icon; display fallback; `PushDelivery` log; per-subscription error state; iOS Home Screen guidance; denied-state guidance; a "Send a test notification" button; an admin delivery report. See [notification-diagnostics.md](notification-diagnostics.md).
- **Tests:** DB (urgency and TTL sent, payload, accepted/failed/expired logged, expired removed, errors categorised, account link/unlink on sign-out, replaced endpoint removed, test push only to the asking browser, diagnostics counts). E2E (real announcement → attempt recorded with platform → honest "0 accepted" message → report visible).
- **Limitation:** no physical Android phone or iPhone here, so device display is unverified; steps for the owner are in notification-diagnostics.md.

## 4–5. Android / iOS — ◐
- Android: same service worker and subscription for Chrome, Edge, Firefox, Samsung Internet and installed PWA; `showNotification` from the push handler, valid icons, destination focus/navigate/open.
- iOS: push only in a Home Screen web app on iOS/iPadOS 16.4+; Safari tabs show installation steps instead of a toggle.
- Not testable without devices (see above).

## 6. Import and bulk publishing — ☑
- **Problems:** Import sometimes did nothing; imports did not reach the queue; multi-select and bulk publishing were unreliable; failures were unexplained.
- **Root causes:** (1) **the scheduler never ran** (§10), so queued imports were never imported and imported apps were never security-checked, and bulk publishing refused every unchecked import ("checks have not finished"); (2) the per-row "Import now" button posted through a separate server action with no pending state or result, so it looked like nothing happened (and double clicks ran twice); (3) "Add to queue" reported "already in the queue or invalid" without saying which; (4) the claim was not atomic, so a second click or an overlapping run could import one website twice; (5) a check that crashed left its revision stuck in "automated checks"; (6) approval was not atomic, so two simultaneous publishes could both run.
- **Fix:** every table action goes through one form with feedback (`op:<id>` for row buttons), buttons disabled while pending, a selected-count, select-all/deselect-all, confirmation dialogs with counts, and new actions *Run security checks*, *Retry selected*, *Retry all failed*, *Queue again*. Failures record stage, category, retryable, attempts, time and job ID. Atomic claims for imports, checks and approvals. "Add to queue" lists added, already queued, already listed and invalid.
- **Tests:** DB (claim prevents double import; retry; concurrent approval → exactly one publish and one status change). E2E (2 URLs → "2 added" → same URLs → recognised → select/deselect/count → *Import selected now* "Imported: 2" → *Run security checks* "Checked: 2" → *Publish selected* "Published: 2" → DB: PUBLISHED with exactly one publish event each → publishing again "Nothing changed" → a down website "Not imported (job #…), stage fetch").

## 7. Bulk publishing results — ☑ (see §6)

## 8. Duplicate detection — ☑
- Canonical host (lower case, no `www.`, no trailing dot), the registrable domain (except shared hosting platforms such as `*.vercel.app`), existing listings (any status except removed), and other queued, importing or imported candidates. Checked when adding, when importing, and hourly by `imports.dedupe` (the earliest of two queued twins keeps its place).
- Tests: DB (www/sub-domain/path variants; shared-host exception; queued twins; listed site) and E2E (re-adding the same sites).

## 9. Description enrichment — ☑ (◐ live sites)
- `imports.enrich` (hourly, 4 listings per run): imported editorial listings without a developer and with < 300 characters. Reads only the app's own homepage (meta/manifest description, explanatory paragraphs of the main content, feature list) and drops navigation, cookie notices and footers. It invents nothing: no pricing, platforms or claims the site does not make. A proposal needs ≥ 250 characters and 1.5× the current text.
- **Review, not overwrite:** a published listing gets a revision *under review* in Admin → Submissions (the previous text is in the revision history and the reviewer notes). A pending import has its pending text improved, with the original kept in the notes. Developer-managed listings are never touched. `Listing.enrichedAt` and `enrichmentResult` record each attempt; it re-checks after 30 days.
- Tests: unit (extraction, composition, no invented claims, no proposal when not clearly better).
- Limitation: production listings will be processed by the scheduler after deployment (4 per hour); results are visible in Admin → Submissions.

## 10. Scheduler — ☑
- **Root cause:** no Hostinger cron job existed for webcenta.com (API listing, 13 Nov). In addition, `node` is not on the cron `PATH`, and the documented curl command required the secret in the command.
- **Fix:** `cron-tick.mjs` (no secret in the command), an atomic scheduler lease (no overlap), per-job start/duration/result/error, JobRun trigger/skipped, stale recovery, pause/resume, Run now, an admin Scheduler page, schedules by workload, and the Hostinger cron entry. See [cron-setup.md](cron-setup.md).
- **Tests:** DB (run + results + failure recorded; overlap skipped; lease expiry; concurrent ticks → one works; paused jobs not scheduled; Run now). E2E (the exact cron script against the production build: HTTP 200 and a JobRun row; held lease → "skipped"; GET 405; missing or wrong secret 401; admin Run now → SUCCEEDED).

## 11–12. Hostinger cron configuration and evidence — see [cron-setup.md](cron-setup.md) and [test-results.md](test-results.md)

## 13. Profile and settings on phones — ☑
- **Problem:** account screens wider than phones; a horizontal strip of settings tabs; every form shown at once.
- **Fix:** phones get `/account` as a list of sections (icon, name, hint), each section on its own screen with "‹ Account"; desktop gets the navigation on the left and the section on the right. New `/account/profile` and `/account/security`. Profile shows the details with **Edit profile**; Security shows **Change password** before the form. `min-w-0`, `overflow-wrap` and responsive rows everywhere.
- **Tests:** E2E at 320 and 390 px (list, back link, no form until requested, no overflow on all 10 account pages, no tab strip) and at 1280 px (sidebar with the current section). Responsive audit at 10 viewports.

## 14. Bottom navigation — ☑
- Exactly **Home, Games, Apps, Search**. Saved apps stay in the account area (account menu → Saved apps, `/account/favorites`); no saved records were touched. E2E checks the four labels and every link.

## 15. Google login — ☑
- Google's standard multicolour G and button style (white with grey outline; dark variant in dark mode), "Continue with Google", accessible name, responsive. A GitHub mark too. OAuth code unchanged.
- Tests: E2E at 320 and 1280 px on sign-in and sign-up (G mark paths, colours, within the screen, no overflow).
- Limitation: the real Google sign-in round trip needs the live site; it is not claimed tested.

## 16. Developer domain verification — ☑
- Step-by-step instructions for every method with exact values and Copy buttons. TXT: type, host (`@` or the sub-domain label, with notes for providers), value, domain, TTL. **New HTML file method**: `webcenta-domain-verification-<16 hex>.html` (unique per code), exact content with Download, upload location and expected address. Meta tag: exact tag and where to put it. A "Check verification" button for each.
- Security: 144-bit CSPRNG codes per organisation and domain, **expire after 14 days** if not proven, and are checked server-side over HTTPS on the domain itself, with no redirect to another host and SSRF-safe fetching. Another organisation's code never matches.
- Tests: DB (unique codes and file names, TXT host labels, expiry) and E2E (HTML file: instructions, wrong content refused, correct file verified).

## 17. Filters — ☑
- One slim bar (result count, sort that applies on change, "Filters" with the active count). Phones: a bottom sheet with backdrop, Escape, scroll lock, Reset and Apply. Desktop: a compact panel under the bar. Every filter kept; it still works without JavaScript (a GET form inside `<details>`).
- Tests: E2E (sheet within 375×812, apply → URL, count badge, Reset; desktop bar < 60 px tall, panel ≤ 600 px).

## 18. Responsive testing — ☑ (◐ real devices)
- `responsive-audit.spec.ts`: 16 pages (public + every account section) × 10 viewports (320×568, 360×800, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080). Checks horizontal overflow, elements beyond the screen, the fixed tab bar inside the screen, console and runtime errors. Results in [responsive-audit.json](responsive-audit.json); screenshots for 320/390/768/1440 in `screenshots/responsive/`.
- Limitation: Chromium device emulation; no physical iOS Safari.

## 19–22. Regression, Git, deployment, manual configuration — see [test-results.md](test-results.md)
