# WebCenter — Testing

All suites run against **real PostgreSQL** (no SQL mocks). E2E tests use an **isolated, freshly created
database** and **local fixture websites**; they never touch production data or real third-party services.

## Suites

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit | `npx vitest run tests/unit` | URL/host/CSP helpers, DB pool config, search parsing and sanitising, taxonomy, SSRF guards (IP ranges, hostnames, URL validation, domain validation), TOTP (RFC 6238 vectors), AES-GCM, scrypt, RBAC matrix, recommendation diversity, Markdown escaping, verdict and status logic, ranking, phishing and look-alike heuristics |
| DB integration | `npm test` (needs a migrated, seeded `DATABASE_URL`) | RLS on every table, CHECK constraints, search trigger, visibility filter (status, security, category, parent, geo, age), search and filters, injection-safe queries, alternatives, homepage rails, rate limiter, job runner (retries, dead jobs), analytics privacy and dedupe, salts, search stats, reports, full listing workflow, review rules and developer replies |
| Schema smoke | `npm run db:smoke` | Core constraints and cascades |
| DB compatibility | `npm run db:check` | TLS, version, `pg_trgm` location, migrations, RLS coverage, Data API privileges (read-only; safe on Supabase) |
| E2E | see below | 10 user journeys, marketplace, security, PWA, responsive/a11y on desktop, tablet and mobile, light and dark |
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

`run-fresh.sh` creates a new database (`webcenter_e2e_<timestamp>`). `prepare.sh` refuses non-empty or
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

## What the automated tests cannot verify

They use emulated browsers (Chromium only) and local substitutes for external services. See
[FINAL_REPORT.md](FINAL_REPORT.md) §“Unverified” for the exact list.
