# WebCenter — Roadmap and Implementation Status

Legend: ✅ done and tested · 🟡 partial · ⬜ planned · ⛔ blocked on a decision

Only items marked ✅ are implemented. Nothing in a future phase should be assumed to exist.

## Phase 0 — Repository and architecture ✅

| Item | Status | Evidence |
| --- | --- | --- |
| Inspect repository | ✅ | Repo contained only a placeholder `README.md`; greenfield |
| Project architecture | ✅ | [ARCHITECTURE.md](ARCHITECTURE.md), [ADRs](adr/) |
| Database schema (all phases) | ✅ | `prisma/schema/*.prisma` — 58 tables; `prisma validate` OK; applied to PostgreSQL 16; `npm run db:smoke` 13/13 passed |
| Deployment strategy | ✅ | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Security design | ✅ | [SECURITY.md](SECURITY.md) |
| Roadmap | ✅ | This file |
| CI for schema checks | ✅ | `.github/workflows/ci.yml` |

## Phase 1 — Marketplace foundation ⬜
* Next.js 16 app scaffold, Tailwind, design tokens, dark/light theme, UI kit (cards, rails,
  skeletons, empty and error states).
* Host-based middleware (public, admin and developer route groups; `www` redirect; security
  headers).
* Baseline migration including FTS, trigram and CHECK SQL.
* Taxonomy seed: the main categories and subcategories (real configuration, not fake data).
* Homepage rails driven by `HomepageSection`. Rails that need data the system doesn't have yet
  (ratings, trending) are hidden, not faked.
* Category pages, listing detail page, `/go/[slug]` interstitial redirect.
* Search with filters and autocomplete (Postgres FTS + `pg_trgm`); alternatives and similar
  listings (content-based).
* Visibility filter (status, security status, geo, age).
* Basic SEO: metadata, canonical URLs, sitemap, robots, JSON-LD `SoftwareApplication`.
* Tests: unit, integration (real DB), Playwright on mobile and desktop viewports.
* Dev-only fixture listings clearly marked as fictional and never seeded in production.

## Phase 2 — Accounts and developer submissions ⬜
Better Auth (email+password, verification, reset, Google, Apple when configured), profiles and
privacy settings, developer organisations and members, domain verification (DNS TXT, meta tag,
well-known file), submission wizard with media upload, and revisions and status tracking.

## Phase 3 — Admin and moderation ⬜
Admin identity (provision CLI, invitations, TOTP), RBAC, audit log, submission review queue,
listing edit/suspend/remove, admin-curated listings and claims, reports, appeals, category
management (add/edit/reorder/merge/disable), homepage and placements, and basic overview metrics.

## Phase 4 — Reviews and discovery ⬜
Ratings and reviews (edit/delete), helpful votes, developer replies with notifications, review
reports and spam heuristics, favourites, collections (user and editorial), trending and popular
scoring jobs, and similar and alternative recommendations.

## Phase 5 — Analytics and personalisation ⬜
Privacy-preserving event capture and daily roll-ups, developer analytics dashboard, platform
analytics, interest signals, recommendation engine with a diversity step, and personalisation and
history controls.

## Phase 6 — Security monitoring ⬜
`safeFetch` (SSRF-hardened), submission checks, threat-intel adapters, risk engine and
auto-approval policy, scheduled re-checks, change detection, alerts, auto-restriction, and
restore/remove workflows with audit.

## Phase 7 — PWA and optimisation ⬜
Manifest, icons, service worker, offline fallback, update prompt, iOS add-to-home-screen
instructions, performance budgets, an accessibility audit (WCAG 2.2 AA target), security testing,
and a backup restore drill.

## Phase 8 — Monetisation and expansion ⬜
Developer plans, featured and sponsored placements (always labelled), enhanced analytics, and
payment integration. Activated only after business and legal review.

## Open decisions (need the owner's input)

| # | Decision | Recommendation | Blocking |
| --- | --- | --- | --- |
| D1 | Where to host PostgreSQL, given that Hostinger managed Node.js only bundles MySQL | Managed Postgres (e.g. Neon or Supabase) in the region nearest the Hostinger datacentre | Phase 1 deploy (not local development) |
| D2 | Object storage provider | Cloudflare R2 | Phase 2 uploads |
| D3 | Transactional email provider | Hostinger SMTP at first, then Postmark or SES | Phase 2 |
| D4 | Apple Developer account for Sign in with Apple (US$99/yr) | Enable later; Google and email first | Phase 2 (Apple only) |
| D5 | Threat-intel providers and budget | Google Web Risk + URLhaus | Phase 6 |
| D6 | Legal review for restricted categories (gambling, adult, forex, crypto) and target markets | Keep these categories `isRestricted` until reviewed | Enabling those categories publicly |
| D7 | Repository name: GitHub repo is currently `webcenta`; spec says `WebCenter` | Rename in GitHub settings if desired (no code depends on it) | Nothing |
