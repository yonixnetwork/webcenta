# Webcenta — Testing

All suites run against **real PostgreSQL** (no SQL mocks). E2E tests use an **isolated, freshly created
database** and **local fixture websites**; they never touch production data or real third-party services.

## Suites

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit | `npx vitest run tests/unit` | URL/host/CSP helpers, DB pool config, search parsing and sanitising, taxonomy, SSRF guards (IP ranges, hostnames, URL validation, domain validation), TOTP (RFC 6238 vectors), AES-GCM, scrypt, RBAC matrix, recommendation diversity, Markdown escaping, verdict and status logic, ranking, phishing and look-alike heuristics, rating maths (all five values, averages, percentages summing to 100), category emojis, static error pages (generated, self-contained), proxy maintenance 503 and `api.` host, test-route guard |
| DB integration | `npm test` (needs a migrated, seeded `DATABASE_URL`) | RLS on every table, CHECK constraints, search trigger, visibility filter (status, security, category, parent, geo, age), search and filters, injection-safe queries, alternatives, homepage rails, rate limiter, job runner (retries, dead jobs), analytics privacy and dedupe, salts, search stats, reports, full listing workflow, review rules and developer replies |
| Schema smoke | `npm run db:smoke` | Core constraints and cascades |
| DB compatibility | `npm run db:check` | TLS, version, `pg_trgm` location, migrations, RLS coverage, Data API privileges (read-only; safe on Supabase) |
| E2E | see below | 10 user journeys, marketplace, reviews, error pages (404/403/500, unavailable apps, static pages), security, PWA and offline, responsive/a11y on desktop, tablet and mobile, light and dark |
| Brand check | `npm run brand:check` | No reference to the retired product name anywhere in tracked files (including split wordmarks) |
| Bundle secrets | `bash scripts/check-bundle-secrets.sh` (after build) | No secrets, connection strings or source maps in client output |
| Backup drill | `scripts/backup.sh` + `scripts/restore-drill.sh` | Dump, restore into an empty DB, identical row counts, RLS and trigger intact |
| Performance | `node scripts/perf.mjs` (server running) | TTFB, FCP, LCP, CLS, transfer size (throttled phone), server latency |

## Running E2E locally

Requirements: PostgreSQL, Chromium (Playwright), `openssl`, permission to bind port 443 (root, or
`sudo sysctl -w net.ipv4.ip_unprivileged_port_start=0`).

```bash
npm run build
E2E_DB_BASE=postgresql://postgres@localhost:5432 bash tests/e2e/run-fresh.sh            # all projects
E2E_DB_BASE=postgresql://postgres@localhost:5432 bash tests/e2e/run-fresh.sh --project=journeys
```

`run-fresh.sh` creates a new database (`webcenta_e2e_<timestamp>`). `prepare.sh` refuses non-empty or
non-test databases. Fixture sites (`*.localhost` on :443, control API on :4599) use a throwaway CA trusted
only by the app under test (`NODE_EXTRA_CA_CERTS`). The scanner may reach loopback **only** when
`SCANNER_ALLOW_PRIVATE_FOR_TESTS=true` **and** the app's `PUBLIC_ORIGIN` is a localhost origin.

## The ten journeys (`tests/e2e/journeys.spec.ts`, `tests/e2e/pwa.spec.ts`)

1. A visitor searches, opens a listing, sees the leaving notice and reaches the official (fixture) website; the click is recorded.
2. A user registers, verifies their email (outbox link), signs out and in, saves an app and writes a review (held for moderation as a new account).
3. A developer registers, creates an organisation, fails then passes well-known-file domain verification, submits an app with a logo, and tracks automated checks → under review.
4. An administrator is provisioned by CLI, accepts the invitation with TOTP enrolment, signs in with MFA, approves and publishes; the app appears in its category and search; the developer is notified.
5. Multiple visitors view and click (a bot and repeat views excluded); after the cron roll-up the developer dashboard shows exactly 4 views and 3 outbound clicks.
6. A signed-in user reports the app; an admin runs a scan from the report and resolves it; the reporter is notified.
7. The site turns malicious; a scheduled cron scan raises a HIGH alert (public warning, admin email, developer notice); blocklisting escalates to CRITICAL and automatic restriction (404).
8. The admin suspends the listing; it disappears from detail, `/go`, alternatives, search, category, sitemap, autocomplete and home; recovery via alert resolution, reinstatement and re-scan restores it; every step is audited.
9. The developer replies to a review; the reviewer sees the bell count, the notification, the public reply and receives an email.
10. PWA: manifest and icons, service-worker control, offline cache and fallback (private pages never cached), real SW update prompt, install prompt handling, iOS Add-to-Home-Screen instructions.

## Reviews and error pages (`tests/e2e/reviews.spec.ts`, `tests/e2e/marketplace.spec.ts`)

- **Reviews:** honest empty state ("No reviews yet. Be the first to review this application."); a new
  account's review is held and not counted; one review is edited through **each rating from 1 to 5**
  and the average, total, per-star count and percentage are checked after each; a second reviewer
  gives 4.5/5 from two reviews (50 % / 50 %); the header badge, JSON-LD `aggregateRating` and search
  card agree; a second submission edits rather than duplicates; helpful votes (not on your own
  review), reporting, deletion and recalculation; layout on a phone. Admin moderation and developer
  replies run in journeys 4 and 9.
- **Error pages:** eight invalid URLs return 404 with the branded page, search and popular
  categories; unknown API paths return JSON 404; an unavailable app shows suggestions that are all
  publicly reachable, a generic reason and no moderation wording; a never-published app is not
  named; a deliberate server error (test-only route) returns 500 with a working retry; admin
  permission denials return 403 at the requested URL and are audited; the static
  `public/errors/*.html` pages load with a strict CSP and no failed requests.
- **Offline:** the precached offline page is styled offline, Retry reports "still no connection"
  while offline and loads the originally requested page once back online; signed-in pages are
  flagged so the service worker never stores them.

## What the automated tests cannot verify

They use emulated browsers (Chromium only) and local substitutes for external services. See
[FINAL_REPORT.md](FINAL_REPORT.md) §“Unverified” for the exact list.
