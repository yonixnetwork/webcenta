# Webcenta — Final Integrated Verification Report

Date: 2026-11-07 · Branch: `claude/youthful-cerf-4xclco` · Status: **ready for staging, then production
deployment after owner approval**. Nothing has been deployed. No paid service has been activated.

## 1. What was built

One integrated Next.js 16 application with a PostgreSQL schema of 61 tables and 2 migrations:
- **Public marketplace** on `webcenta.com`.
- **Developer portal** at `/developer` (`developers.` redirects there).
- **Admin portal** on `admin.` with a separate identity system.
- **Cron-driven job runner** and **SSRF-safe security scanner**.

The full feature list with status is in [ROADMAP.md](ROADMAP.md); the architecture is in
[ARCHITECTURE.md](ARCHITECTURE.md).

The required integrations were exercised end to end by the E2E journeys:
- submission → automated checks → moderation → publication in categories and search;
- views and outbound clicks → analytics roll-ups → developer and admin dashboards;
- failed security re-check → alert → automatic restriction → investigation → suspension → recovery;
- review → moderation → developer reply → notification and email;
- suspension and country/age rules → hidden from search, categories, recommendations, sitemap,
  autocomplete and direct URLs.

## 2. Tests executed (final run, all on real PostgreSQL 16)

| Suite | Result |
| --- | --- |
| ESLint (`eslint .`) | 0 errors, 0 warnings |
| TypeScript (`tsc --noEmit`, strict) | 0 errors |
| Unit + DB integration (Vitest, 14 files) | **182 passed, 0 failed** (passed twice consecutively on the same database) |
| Schema smoke test | 13/13 passed |
| Prisma migration drift (`migrate diff --exit-code`) | no drift |
| Supabase-like role simulation (`anon` denied, no default grants) | passed |
| `npm run db:check` (local) | all required checks passed |
| E2E (Playwright/Chromium, fresh database) | **89 passed, 0 failed, 0 skipped** across the `journeys`, `desktop`, `tablet` (iPad landscape) and `mobile` (Pixel 7) projects |
| Backup → restore drill | 61 tables restored with identical row counts; RLS and search trigger intact |
| Client bundle secret scan | no secrets, connection strings or source maps (29 files) |
| `npm audit --omit=dev` (production dependencies) | 0 vulnerabilities |
| **GitHub Actions CI on a clean runner** (all of the above plus the E2E suite) | **passed**: run #17 for commit `a61df60` (https://github.com/yonixnetwork/webcenta/actions/runs/42325660895) |
| `npm audit` (incl. dev tooling) | 8 moderate in ESLint tooling (`minimatch` via typescript-eslint); the only offered fix downgrades `eslint-config-next` across a major version. Dev-only, not shipped. |

The E2E coverage:
- **10 user journeys:** see [TESTING.md](TESTING.md).
- **Marketplace:** every page, filters, autocomplete, theme toggle, report form, 404 statuses,
  host routing, sitemap/robots, headers, cron authentication.
- **Responsive:** 20 public pages × 3 device classes × light/dark themes (no horizontal overflow, no
  console errors); an internal-link crawler (30+ pages, no broken links); header, mobile tab bar and
  footer navigation.
- **Accessibility:** axe WCAG 2.1 AA scans with no serious or critical violations, in both themes.
- **PWA:** see §6.
- **Security:** 13 tests, see §4.

## 3. Defects found by testing and fixed

All of these were fixed and re-verified by the failing test and its related suite.

1. **The SSRF blocklist blocked every public IPv4 address.** Node's `BlockList` maps IPv4 into
   `::ffff:0:0/96`, which was listed. The scanner would have failed every real website.
2. **"Visit website" redirects were blocked by CSP `form-action`** after client-side navigation.
3. **Admin login and other admin actions landed on the public site.** Server-action redirects
   bypassed the host rewrite.
4. **Monitoring could lift a restriction set elsewhere** (a status downgrade while alerts were open).
5. **Reports from signed-in users were stored anonymously**, so reporters were never notified.
6. **A NUL byte in a search query caused HTTP 500.**
7. **Raw IP addresses were accepted as domains** in domain verification.
8. **The homepage had a React hydration error** (nested links in collection cards).
9. **The service worker's first install reloaded the page.**
10. **Developers got no confirmation after submitting** (now a persistent status banner).
11. **Recommendations returned short lists** when interest matches ran out (now backfilled).
12. **Soft-404s:** hidden pages returned 200 under a group loading boundary (Phase 1).

Found during the brand correction and its re-test:

13. **The logo still read "Web…Center".** The wordmark is split across two elements, so the textual
    rename missed it. The new brand check (`npm run brand:check`, in CI) catches split wordmarks.
14. **Rated cards widened the page on phones by about 1,100 px.** Screen-reader text on a rated card
    inside a horizontal rail was positioned outside the scroller. Only visible once a listing had
    ratings; caught by the mobile overflow test and now covered explicitly in the reviews spec.
15. **Admin permission denials were redirects with status 200 and were not audited** (and the
    E2E assertion for the audit entry was vacuous: `>= 0`). They now return a real 403 and every
    page-level denial is audited; the test asserts exactly five entries.
16. **Documentation drift:** `SECURITY.md` listed a "same network" review heuristic that does not
    exist, and `ARCHITECTURE.md` described a `developers.` host rewrite and an `api.` host that did not
    match the code. Both are corrected; `api.webcenta.com` now has a defined, tested behaviour.
17. **Seven lint warnings** (unused code, stale disable directives) had crept in although the
    previous report said zero; fixed.

## 3a. Brand correction and user-experience additions

- **Brand:** the product is **Webcenta** at **webcenta.com** everywhere: code, metadata, Open Graph,
  manifest, service worker, emails, seed data, scripts, CI, tests, docs and screenshots. Identifiers
  changed include the database trigger function (`webcenta_listing_search_vector`; the baseline
  migration was edited, which is safe only because nothing has been deployed), the domain-verification
  prefix (`webcenta-verification`). The cookie prefix `wc` and theme cookie `wc-theme` were already
  brand-neutral and are unchanged.
- **No decorative photography:** Lucide icons throughout, one emoji per top-level category
  (`Category.emoji`, editable by admins), real developer logos and screenshots only.
- **Reviews:** "★★★★★ 4.8/5 · Based on N reviews", per-star counts and percentages (always summing to
  100), dated reviews, developer replies, edit/delete/helpful/report, honest empty state. The average
  is shown from the first published review (with its count beside it), on the app page, cards and
  JSON-LD. Held reviews are never counted.
- **Offline:** branded page ("You're currently offline.") precached with its CSS and JS. Retry checks
  the network and reloads the requested page, which also happens automatically when the connection
  returns. It states which features need a connection.
- **Error pages:** 404 / 403 / 500 / maintenance 503 with correct status codes; JSON 404 for unknown API
  paths; "application unavailable" page with same-category and alternative suggestions and no
  moderation details; static fallback pages for the host or CDN. See
  [DEPLOYMENT.md §5a](DEPLOYMENT.md) for what happens when the app itself is down and the limits of
  each option.

## 4. Security assessment

**Tested and passing:**
- SQL and tsquery injection.
- Stored XSS (names, reviews; Markdown renderer escapes everything).
- CSRF (auth origin checks, beacon origin checks, forged server actions rejected).
- Open redirects (`next` parameter, `/go` destination fixed to the stored URL).
- SSRF (private, loopback, metadata and mapped IPv6 ranges; hostnames; ports; credentials; redirect
  into `169.254.169.254`; IP-literal domains).
- Malicious uploads (SVG, polyglot; images re-encoded; PDF magic check).
- Broken access control (other users' collections, other organisations' listings, public sessions
  on the admin host, internal admin paths on the public host).
- Session security (HttpOnly, SameSite Lax for users and Strict for admins; logout invalidates the
  token; suspension revokes sessions and blocks sign-in).
- RBAC and privilege escalation (Analytics Viewer is limited to analytics; only Super Admins manage
  admins; the last Super Admin cannot be demoted).
- Admin brute force (lockout after 5 failures, logged) and user sign-in rate limiting (429).
- TOTP replay protection.
- Secret exposure (no `.env` or source files served, no secrets in HTML or bundles).
- Security headers (CSP with nonces, `frame-ancestors 'none'`, nosniff, HSTS in production, `no-store`
  on admin).

**Unresolved risks (accepted or pending):**
- **The scanner runs inside the web process on Hostinger.** It is protected by DNS pinning, range
  blocks, timeouts and size caps, but not by network isolation. Move it to an isolated host at the
  VPS stage, and before adding headless-browser rendering.
- **Client IPs come from `X-Forwarded-For`** (rate limits, analytics hashing, admin allow-list). Set
  `TRUSTED_PROXY_HOPS` to the real proxy depth. Behind Cloudflare, prefer `CF-Connecting-IP`; this is
  already used for the admin allow-list.
- **The CSP allows inline style *attributes*** (`style-src-attr 'unsafe-inline'`); scripts are
  nonce-only.
- **Without Cloudflare (or another geo header)** every visitor's country is unknown, so geo-restricted
  content is hidden for everyone (the `deny` policy). Country checks are best effort; VPNs bypass
  them.
- **18+ access is a self-declaration, not age verification.** Restricted categories (gambling,
  adult, forex, crypto exchanges, etc.) stay hidden until legal review (D6).
- **Unique-visitor figures are exact per day only.** Multi-day "uniques" are labelled as sums of
  daily uniques.
- **No external error monitoring yet** (Sentry is not wired); rely on Hostinger logs and Admin →
  Jobs & email.
- **Legal texts are DRAFT templates.** They are unpublished, so `/legal/*` shows a "being finalised"
  notice until a lawyer approves them. No compliance is claimed.
- **No independent penetration test** has been performed.

## 5. Performance (local production build, throttled mobile profile)

Profile: Pixel 7 emulation, 4× CPU slowdown, ~1.6 Mbps, 150 ms latency.

| Page | TTFB | FCP | LCP | CLS | Transfer |
| --- | --- | --- | --- | --- | --- |
| `/` (cold) | 107 ms | 616 ms | 616 ms | 0 | 185 KB |
| `/categories` | 20 ms | 156 ms | 520 ms | 0 | 8 KB |
| `/c/productivity` | 26 ms | 172 ms | 172 ms | 0 | 7 KB |
| `/search?q=notes` | 17 ms | 160 ms | 512 ms | 0 | 8 KB |
| `/app/…` | 62 ms | 192 ms | 192 ms | 0 | 6 KB |

Server medians (30 requests): autocomplete 8 ms, search 15 ms, app page 26 ms.

These are measured against a **local** database. Production adds Supabase network latency (choose
the same region as Hostinger). **Not measured:** load or concurrency testing at scale.

## 6. PWA compatibility

| Platform | Result |
| --- | --- |
| Chromium desktop (Windows/macOS/Linux behaviour) and Android (Pixel 7 emulation) | Manifest, icons, SW control, offline cache and fallback, update prompt, and install-prompt handling **tested** (the `beforeinstallprompt` event was simulated) |
| iOS/iPadOS Safari | Add-to-Home-Screen instructions **tested with an emulated iOS user agent in Chromium**. Real Safari/WebKit was **not** tested. |
| Real-device installation on Android, iOS, Windows, macOS, Linux | **Unverified.** Needs the HTTPS production or staging domain and physical devices or browsers. |

## 7. Authentication provider status

| Provider | Status |
| --- | --- |
| Email + password, verification, reset | Implemented and tested E2E (email via the log transport) |
| Google | Implemented; buttons appear when `GOOGLE_CLIENT_ID/SECRET` are set. **Not tested against Google** (no credentials). |
| Apple | Implemented; needs an Apple Developer account and a client-secret JWT. **Not tested against Apple.** |
| Admin (password + TOTP) | Implemented and tested E2E |

## 8. Cron jobs

Endpoint: `POST /api/cron/tick` with `Authorization: Bearer <CRON_SECRET>`. It was **tested locally and
in E2E**: unauthorised requests are rejected, and roll-ups, scans, email delivery and retries work.
Recurring jobs:

| Job | Schedule |
| --- | --- |
| Email delivery | every 5 min |
| Analytics roll-up | every 15 min |
| Monitoring enqueue | every 15 min |
| Ranking recompute | hourly |
| Maintenance (expired data, salts) | hourly |
| Raw-event purge | daily |
| History purge | daily |
| Deleted-account purge | daily |

**The Hostinger Cron configuration itself is unverified** (no Hostinger access).

## 9. Hostinger deployment compatibility

The app uses no WebSockets, permanent worker, Docker or Redis, and no hosting-specific paths.
- **Background work** is time-boxed (25 s per tick).
- **The database pool** is small and safe for the Supabase pooler.
- **Uploads** go to S3-compatible storage (the local driver is for development and VPS use only).

**To verify in hPanel:** the Node 22 runtime; that the build installs devDependencies; build memory;
multiple domains on one app; the cron interval.

## 10. External services still requiring configuration (owner)

| Service | Purpose | Notes |
| --- | --- | --- |
| Supabase | Database | Run `db:check` against the project |
| SMTP | Email | Hostinger mailbox or another provider |
| S3-compatible bucket | Uploads | Cloudflare R2 recommended |
| Google OAuth | Sign-in | Optional |
| Apple Developer Program | Sign in with Apple | US$99/yr, optional |
| Threat intelligence | Scanner | Google Web Risk (commercial terms) and/or abuse.ch URLhaus; VirusTotal needs a commercial licence |
| Cloudflare | Geo header, DDoS protection | Recommended, free plan |
| Legal review | Policies and restricted categories | Required before publishing policies or enabling restricted categories |

## 11. Exact deployment instructions

See [DEPLOYMENT.md §2–4](DEPLOYMENT.md). In short:
1. Create the Supabase project and run `db:check`.
2. `prisma migrate deploy` and `db:seed`, using `DIRECT_URL`.
3. `admin:provision` for the first Super Administrator.
4. Configure the Hostinger app (Node 22, `npm ci` / `npm run build` / `npm start`, environment
   variables from §3).
5. Attach the four domains with HTTPS.
6. Add the cron curl job (every 10 minutes).
7. Run the smoke checklist.

A staging run first is strongly recommended.
