# Final hardening — checklist

☑ done and verified · ◐ done, partly verifiable here (reason given) · ✗ owner action / not possible here.
Baseline: `main` at `0f336ea`. Evidence: [test-results.md](test-results.md), [screenshots](screenshots/), [responsive-audit.json](responsive-audit.json).

## 1. Test notifications only in Admin — ☑
- Removed the "Send a test notification" button, its client code and the public `/api/push/test` endpoint (now 404). Users keep only "Turn notifications on/off".
- **Admin → Push notifications → Test push notification**:
  1. Enter a recipient's account email → *Find devices*.
  2. Pick one device (platform, installed app, last confirmed, last accepted, failures).
  3. Set title, message and destination → *Send test to this device*.
- The result is the push service's real answer (accepted with HTTP status, or the failure category). Nothing is faked.
- It is sent to that one subscription only (addressed by id, never fan-out). Recorded as kind `TEST`, separate from user notifications (EVENT), reminders and promotional announcements (CAMPAIGN), and never added to anyone's notification centre. Audited as `push.test` with the subscription id and outcome, never the endpoint or keys. Rate-limited to 20 per 10 minutes per administrator.
- Tests: DB (only the chosen subscription is called, recorded as TEST) and E2E (no button for users, endpoint 404, one TEST delivery of two devices, no endpoint in the audit log).

## 2. Advertising frequency and placement — ☑ (◐ live fill)
- **Root causes of crowding:** the homepage placements sat at fixed positions (after sections 2 and 4) whatever their size, nothing coordinated ads across a page, and the responsive banner rendered three containers.
- **Central placement manager** (`src/server/ads/manager.ts` plus the guard in `<AdSlot>`):
  - On the server, the feed is planned in whole sections: never first or last, at least *N* sections apart, at most the page maximum, each placement once.
  - In the browser, the guard checks every slot against the real layout, in document order, before anything loads:
    - one instance per placement (no duplicates from re-renders or navigation);
    - at least the minimum distance between ads (default 700 px);
    - at most the page maximum (home 3, app page 3, browse pages 1);
    - at most 2 on phones;
    - mobile and desktop switches respected.
  - Rejected slots collapse before requesting anything.
  - The responsive banner position counts as one ad.
- **Compact sponsored unit on app pages:**
  - A "Ready to try {app}?" box after the app's details contains a dashed, labelled "Advertisement" native unit (reserved 160 px, capped at 360 px) above a "Visit official website" button.
  - The Visit button at the top of the page has no ad near it.
  - The 300 × 250 moved to the end of the page, after the reviews.
- **Admin controls** (Settings → Ad placements, clamped so no configuration can stack ads):
  - maximum ads on the homepage, app pages, browse pages and phones;
  - minimum distance in px;
  - content sections between ads;
  - phones on/off and tablets/computers on/off;
  - each placement on/off, including the new compact app-page unit;
  - provider priority;
  - an AdSense unit id per placement.
- Sizes by device are unchanged:
  - phones get native, 300 × 250 and 320 × 50;
  - tablets get 468 × 60;
  - desktops get 728 × 90, and 160 × 600 on wide screens.
- AdSense is still used only when approved, preferred and configured, otherwise Adsterra, and never both in one slot.
- Tests:
  - DB: feed planning.
  - E2E at 1440 and 390 px on the home, search and app pages:
    - loaded ads ≤ the maximum;
    - each pair ≥ 700 px apart;
    - no overlaps;
    - the compact unit sits inside the Visit box and is labelled;
    - none on sign-in;
    - the tab bar stays inside the screen.
- Limitation: real ad fill cannot be observed here (tests use a non-existent ad host and so generate no impressions).

## 3. Security — ☑ (details in [security-audit.md](security-audit.md))
- **New:**
  - step-up confirmation for sensitive admin actions;
  - new-device admin sign-in emails;
  - a per-address admin sign-in limit;
  - the client address now taken from trusted proxy hops (was spoofable);
  - security event log, an Account and request security dashboard, and alert emails;
  - search rate limits that let verified crawlers through;
  - admin import and bulk rate limits;
  - COOP, `X-Permitted-Cross-Domain-Policies` and an extended Permissions-Policy.
- **Verified existing controls:**
  - MFA, scrypt hashing, lockout, host-only Strict cookies;
  - RBAC with audit;
  - no unsafe SQL;
  - escaped output and a safe markdown renderer;
  - CSRF protection (Next.js origin checks, Better Auth, SameSite);
  - SSRF protection (DNS pinning, redirect checks, size and time limits);
  - upload re-encoding;
  - clickjacking headers.
- Docs: [incident-response.md](incident-response.md), [backup-restore.md](backup-restore.md); Hostinger limitations and the optional Cloudflare recommendation are in the audit.
- Tests:
  - DB: step-up (missing, wrong, reused and valid codes; 10-minute window; lockout counting), event counting and alert-once, rate-limit recording, crawler verification.
  - E2E: an invitation is refused without confirmation, refused with a wrong code and accepted with a valid one; the security dashboard shows failed sign-ins and sessions; security headers.
  - Existing security suite (XSS, CSRF, SSRF, IDOR, uploads, session isolation, brute force, RBAC): passing.

## 4. Import clean-up and duplicates — ☑
- Duplicate detection (normalised host, registrable domain, existing listings, queued, importing or imported records) now **links** the duplicate to the existing listing (`duplicateOfListingId`). Bulk publishing and automatic publishing re-check for a live listing on the same website and refuse duplicates (with the reason in the audit log).
- **Daily `imports.cleanup`** (retention configurable, default 30 days):
  - It deletes only queue entries that never became a listing: confirmed duplicates and permanent failures. It also deletes long-dead scheduler jobs and re-queues stuck imports.
  - It never touches listings, developer submissions, reviews, saved apps, claims, appeals or moderation records.
  - Every run is logged (what and why) and shown under Import web apps → *Clean-up history*.
- Automatic publishing still requires every check to pass (no failed check, external malware source, risk threshold, allowed category, complete record, no open reports) and now also "not a duplicate".
- Tests: DB (only old, listing-less duplicates and permanent failures are deleted; recent, retryable and linked records are kept; the log names what was removed).

## 5. Bulk approval — ☑
- **Import web apps:**
  - selection: select all eligible, select visible, deselect all, individual rows;
  - actions: publish selected, publish all eligible, send for review, exclude, retry selected, retry all failed, plus the existing reject, archive, run checks and move;
  - counts and confirmations before running.
- **Submissions** (new):
  - selection: select all eligible, select visible, deselect all;
  - actions: approve selected, approve all eligible, request more information, reject, suspend (published listings);
  - a reason is required for reject, information and suspend;
  - confirmation dialogs with counts;
  - an authenticator confirmation for reject and suspend.
- **Per-row eligibility column.** Each record goes through the same checks as an individual approval:
  - automated checks finished without a failure;
  - no open security alert or report;
  - complete (logo, description ≥ 80 characters);
  - not a licence-evidence, manual-review or high-risk category.
- Ineligible records are skipped with their reason. Every bulk action is audited (administrator, time, affected records) and rate-limited.
- Tests: DB (five records → one eligible approved, four skipped with exact reasons; reject and request information with reasons; suspend only published listings). E2E (real imported submissions, select visible, approve → the published count matches exactly; reject without a reason is refused).

## 6. Developer updates and user notifications — ☑
- Developers submitting an update to a published app can write **"What changed?"** (shown to people who saved the app).
- On approval Webcenta records the **changed fields** on the revision. Previous versions remain in the revision history. Metadata (tags, languages, countries) is recorded but never notifies anyone, and typo-level edits do not count.
- People who saved the app get one in-app notification per meaningful update. The message reads "An app in your saved list has been updated." followed by the developer's summary or a list of what changed, with a View action, and is also pushed to their devices if they allow it. It is not repeated for the same update, sent at most once a day per app, and respects the existing "updates to saved apps" preference.
- Tests: DB (change classification; meaningful update → one notification with the summary, none the second time; a tags-only update queues nothing).

## 7. Desktop profile navigation — ☑
- On desktop, account pages show **"Back to marketplace"** at the top of the settings navigation and a **Home › Account › Section** breadcrumb. The sidebar is sticky and scrolls within the screen. On phones, the list-and-screen layout is unchanged.
- Tests: E2E at 1280 px (the breadcrumb and back link work, no overflow) and 390 px (phone layout unchanged); responsive audit.

## 8. SEO — ☑ (✗ verification is the owner's action) — see [seo-guide.md](seo-guide.md)
- Sitemap https://webcenta.com/sitemap.xml and robots https://webcenta.com/robots.txt verified (valid XML, correct inclusions and exclusions, sitemap linked). Admin and developer hosts are noindex.
- **New:** Google HTML-file verification and Bing XML-file verification served from Settings (meta tags already supported); IndexNow also on suspension, removal and reinstatement.
- App pages: unique title and description, canonical URL, Open Graph, honest structured data (verified by E2E).

## 9–10. Tests, deployment, report — see [test-results.md](test-results.md)
