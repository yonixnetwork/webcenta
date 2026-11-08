# Webcenta — Architecture

Status: **Phase 1 implemented** (marketplace foundation). This document describes the target architecture. Only items marked
✅ in [ROADMAP.md](ROADMAP.md) are implemented.

## 1. Goals and constraints

| Goal | Consequence |
| --- | --- |
| Start on **Hostinger managed Node.js hosting**, migrate later without a rewrite | One Node.js process, no Docker, no Redis, no permanent background worker, no inbound WebSockets. Everything is configured through environment variables. |
| Global marketplace with strong SEO | Server-rendered pages, stable URLs, structured data, sitemaps. |
| Trust and safety as a core feature | Separate admin identity, audit trail, risk-based review, SSRF-safe scanning, continuous monitoring. |
| Small team, AI-assisted development | A **modular monolith** in one repository and one language (TypeScript), with clear module boundaries so parts can be extracted later. |

## 2. High-level design

```
                    ┌──────────────────────────── one Next.js deployment ───────────────────────────┐
 webcenta.com ───► │  proxy.ts (host routing, CSP nonce, maintenance 503, x-pathname)             │
 admin.…       ───► │   ├─ app/(public)      marketplace + /developer portal (SSR)                   │
 developers.…  ───► │   │                    (developers.… redirects to webcenta.com/developer)     │
 api.…         ───► │   ├─ app/admin-host    admin portal  (separate auth, MFA, host-only cookie)   │
                    │   └─ app/api/*         JSON API (public read API, webhooks, cron endpoint)    │
                    │                                                                                │
                    │  src/server/<module>   domain services — the only code that touches the DB    │
                    └───────┬───────────────────────┬───────────────────────┬────────────────────────┘
                            │                       │                       │
                    MySQL / MariaDB         Files (disk or S3)       External services
                (data, FTS, job queue)     (local disk → S3/R2)   (email, OAuth, threat intel)
                            ▲
                            │  Hostinger Cron → POST /api/cron/tick (bearer secret, every ~10 min)
                    ┌───────┴────────┐
                    │ job runner      │  scans, re-checks, analytics roll-ups, emails, cleanups
                    │ (same codebase) │  On a VPS: long-running worker + isolated scanner host.
                    └────────────────┘
```

### Why one deployment for several subdomains?

Hostinger Business runs a single Node.js app, so all four hostnames start out served by
**one Next.js app**. `src/proxy.ts` (Next.js 16's name for middleware) maps the request `Host` to a route group:

| Host | Route group | Notes |
| --- | --- | --- |
| `webcenta.com` | `(public)` | Canonical public site. |
| `www.webcenta.com` | — | Permanent 308 redirect to `https://webcenta.com`. |
| `admin.webcenta.com` | `app/admin-host` (internal rewrite) | Only reachable on this host; requesting `/admin-host/…` directly on any host returns 404. Separate cookie, separate user table, MFA. `noindex`. |
| `developers.webcenta.com` | — | Permanent 308 redirect to `https://webcenta.com/developer` (the portal shares the public user session). |
| `api.webcenta.com` | `app/api` | Optional. Serves `/api/*` only and redirects other paths to `webcenta.com`. The site calls `webcenta.com/api`; split later if a mobile client or third parties need it. |

Isolation does **not** rely on hidden links. Admin authorisation is enforced on every admin route
and server action, on the server. When traffic or risk justifies it, `(admin)` can become a second
deployment of the same repository (`APP_SURFACE=admin`) behind an IP allow-list or VPN, with no code
changes to the domain modules.

## 3. Technology choices

Each choice has an ADR in [`docs/adr`](adr/).

| Concern | Choice | Why (short) | Migration path |
| --- | --- | --- | --- |
| Language | TypeScript (strict) | One language front to back; strong typing for a large schema. | — |
| Web framework | **Next.js 16 (App Router), React** | SSR/ISR for SEO, server actions, route groups for the subdomains, first-class Hostinger support. | Runs unchanged on any Node host, VPS or container. |
| UI | Tailwind CSS + Radix UI primitives (shadcn/ui pattern) + Lucide icons | Accessible primitives, consistent design tokens, dark/light themes. | — |
| Database | **MySQL / MariaDB** — Hostinger MySQL (MariaDB ≥ 10.6) on the same account; MySQL ≥ 8.0 also supported | Included with Hostinger Business, no external service. InnoDB, FULLTEXT, JSON, CHECK constraints, `SKIP LOCKED` job queue. See ADR-0008. | Same engine on a VPS or DigitalOcean (managed MySQL with TLS) via `scripts/backup.sh` / restore. |
| ORM / migrations | **Prisma 7** (driver adapter `@prisma/adapter-mariadb`) | Typed client, migration history, readable multi-file schema. Hand-written SQL only for collations and CHECKs; no triggers or routines. | — |
| Search | InnoDB FULLTEXT on an app-maintained search document + trigram tokens for typo tolerance, behind the search module's small interface | No extra service on shared hosting; good enough for tens of thousands of listings. | Meilisearch/Typesense/OpenSearch adapter on a VPS, fed by the job queue. |
| Auth (public users and developers) | **Better Auth** | Email+password, verification, reset, Google, Apple, rate limiting, 2FA plugin; Prisma adapter; self-hosted, no per-user cost. | — |
| Auth (admins) | Separate, minimal custom session layer + TOTP (`AdminUser`, `AdminSession`) | Admin identity must not share tables, cookies or sign-up flows with public users. | WebAuthn/passkeys; SSO later. |
| Validation | zod | One schema for forms, API and server actions. | — |
| File storage | `StorageDriver` interface: **local disk** (Hostinger: an absolute folder outside the app directory, served at `/media`) / S3-compatible (R2, B2, S3), optional | No paid service needed to start; production refuses a storage folder that redeploys would wipe. | Change the driver configuration only. |
| Images | Upload → validate (magic bytes, size, dimensions) → re-encode with `sharp` → store. Served via `next/image`. | Strips metadata and payloads embedded in images. | CDN in front of the bucket. |
| Background jobs | DB-backed queue (`Job` table), ticked by Hostinger Cron via `POST /api/cron/tick` | No Redis or permanent worker needed. | Same runner as a long-lived process (systemd/pm2) on a VPS; BullMQ only if needed. |
| Scheduled scanning | Job types `scan.listing` and `monitor.enqueue`; the scanner module uses SSRF-safe fetch | Works under cron; time-boxed. | Move the scanner to an **isolated host or container** with egress-only networking (recommended before high volume). |
| Analytics | Own privacy-first events, `ListingEvent` → daily roll-ups | No third-party tracker on listing pages; developers see aggregates only. | ClickHouse/TimescaleDB if volume demands. |
| Caching | Next.js data cache / ISR + in-process LRU; HTTP cache headers | No Redis on shared hosting. | Redis/Valkey on a VPS for a shared cache and rate limits. |
| Rate limiting | `RateLimitBucket` table (fixed window) + Better Auth's built-in limiter | Works on a single instance without Redis. | Redis-backed limiter. |
| Email | SMTP via Nodemailer (Hostinger mailbox at first) behind an `EmailSender` interface | Zero extra cost to start. | Postmark, SES or Resend for deliverability. |
| Error monitoring | Sentry (optional, free tier), structured JSON logs (pino) | Optional DSN; the app runs without it. | — |
| Testing | Vitest (unit/integration against real MariaDB and MySQL), Playwright (E2E, PWA, mobile viewports) against the standalone server | Real database in tests, no mocks for SQL. | — |
| CI | GitHub Actions: MariaDB 10.11 job (full pipeline incl. Hostinger-style build and E2E) and MySQL 8.0 job (database suites) | Repository is the source of truth. | — |
| Build & runtime | `next build --webpack`, `output: "standalone"` | What Hostinger's Node.js hosting builds and runs for Next.js. | Same server under systemd/pm2 on a VPS. |

## 4. Source layout (target)

```
prisma/
  schema/*.prisma           domain-split schema
  migrations/               committed migration history (from Phase 1)
  seed/                     taxonomy + clearly-marked DEV-ONLY fixtures
src/
  app/
    (public)/               marketplace: /, /search, /c/[slug], /app/[slug], /go/[slug], /collections/…
    (developer)/            developer portal
    (admin)/                admin portal
    api/                    route handlers (public API, cron, webhooks)
    manifest.ts, sitemap.ts, robots.ts
  components/               UI kit (cards, rails, skeletons, empty/error states)
  server/                   domain modules (no React imports)
    catalog/  search/  listings/  developers/  reviews/  moderation/
    analytics/  recommendations/  security/  scanner/  jobs/  admin/
    auth/  storage/  email/  audit/  geo/  ranking/
  lib/                      shared utilities (url normalisation, slugs, i18n)
  proxy.ts                  host routing, CSP nonce, security headers
scripts/                    CLIs: jobs:tick, admin:provision, db:smoke
docs/                       architecture, security, deployment, ADRs, roadmap
tests/                      vitest + playwright
```

Module rule: route handlers and pages call `src/server/*` services. Services own their tables and
publish changes through function calls or enqueued jobs, so a module can later become a separate
service without touching its callers.

## 5. Key flows

### 5.1 Listing lifecycle

```
DRAFT ──submit──► SUBMITTED ──► AUTOMATED_CHECKS ──┬─(low risk, all checks PASS, policy allows)──► APPROVED ──► PUBLISHED
                                                    ├─► UNDER_REVIEW ──► APPROVED / REJECTED / INFO_REQUIRED
                                                    └─(FAIL on threat intel)──► REJECTED (manual confirmation)
PUBLISHED ──(monitoring alert ≥ threshold)──► SUSPENDED (auto-restricted) ──admin──► PUBLISHED | REMOVED
```

* Developers only ever edit **`ListingRevision`** rows. The live `Listing` row changes only when a
  revision is approved, inside one transaction. A published listing stays live, unchanged, while
  an update is under review.
* Every transition writes `ListingStatusChange` and `AuditLog` rows.
* Editorial listings (`source = EDITORIAL`) go through the same checks, always credit
  `publisherName`, and can be claimed via `ListingClaim` + `DomainVerification`.

### 5.2 Outbound link ("Visit Website")

1. The button links to `/go/{slug}`. This is an internal URL; the destination is **never** taken
   from the query string, so it cannot become an open redirect.
2. The handler looks up the listing. If it is not `PUBLISHED`, or its security status is
   `RESTRICTED`, it shows a notice instead of redirecting.
3. It records an `OUTBOUND_CLICK` `ListingEvent` (privacy-preserving visitor hash) and shows an
   interstitial: "You are leaving Webcenta for example.com". The user continues with a click; an
   optional auto-continue is allowed only for low-risk listings.
4. The external link uses `rel="noopener noreferrer nofollow"` (sponsored links also get
   `rel="sponsored"`).

### 5.3 Ranking (organic vs sponsored)

`popularityScore` and `trendingScore` are computed by a job from organic signals only: views,
outbound clicks, favourites and rating with Bayesian smoothing, with time decay for trending.
Sponsored placements live in `FeaturedPlacement` (`isSponsored = true`). They are rendered in
labelled slots and are **never** used as inputs to scores or search ranking. Ranking weights are
stored in `SystemSetting`, and every change to them is audited.

### 5.4 Recommendations (Phase 5)

A content-based model fits the hosting constraints: category and tag overlap, pricing and
platform, and FTS similarity. It is blended with item-to-item co-occurrence (co-favourite and
co-view) and the user's interest weights. A diversity step reserves at least 20% of slots for
categories outside the user's top interests, so recommendations don't trap users in one
category. When `personalizationEnabled = false`, users get only non-personal rails.

### 5.5 Visibility filter

All public queries go through `publicListingFilter(ctx)`. It combines:

* `status = PUBLISHED`, `securityStatus ≠ RESTRICTED` and `deletedAt IS NULL`;
* category `isEnabled` and not `isRestricted`;
* no `GeoRestriction` row for the request country (country from the CDN or host header, or the
  user's preference; best effort, not guaranteed);
* `ageRating` ≤ the viewer's allowed rating (self-declared or confirmed; never claimed as verified
  age).

Search, rails, sitemaps and the recommendation engine all go through this filter, so there is one
place to get it right.

## 6. Non-goals for the first phases

* No microservices, Kubernetes, message brokers or a separate search cluster.
* No native mobile apps. The PWA is not presented as an app-store app.
* No measurement of conversions on external sites without an explicit developer integration.
