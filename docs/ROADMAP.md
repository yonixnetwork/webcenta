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

## Phase 1 — Marketplace foundation ✅

**Compatibility checks (Hostinger Business + Supabase), done first:**

| Check | Status | Evidence |
| --- | --- | --- |
| Baseline migration applies cleanly; no Prisma drift | ✅ | `prisma migrate deploy`, then `prisma migrate diff --exit-code` = 0 (local PG 16 and CI) |
| Supabase conventions: `extensions` schema, pg_trgm | ✅ | Migration + `tests/db/schema.test.ts` |
| Supabase Data API exposure closed (RLS everywhere, privileges and default privileges revoked) | ✅ | Simulated `anon`/`authenticated` roles: `anon` gets "permission denied"; tables created later get 0 grants |
| Pooler-safe DB client (transaction pooler, small pool, no session state, TLS verify with CA) | ✅ | `src/server/db-config.ts` + unit tests. **Not yet tested against a real Supabase project.** |
| Migrations via session pooler (`DIRECT_URL`), not during the Hostinger build | ✅ | `prisma.config.ts`, DEPLOYMENT.md |
| No WebSockets, workers, Redis or Docker; cron over HTTPS | ✅ | `/api/cron/tick` + DB job queue, tested |
| `npm run db:check` read-only compatibility report for the real Supabase project | ✅ | Script; owner runs it with production credentials |

**Features:**

| Item | Status | Evidence |
| --- | --- | --- |
| Next.js 16 app, Tailwind 4 design tokens, light/dark/system theme without flash | ✅ | Screenshots in `docs/screenshots/` |
| Host routing (`www` → apex 308, admin and developer placeholders `noindex`, internal paths 404), CSP with nonce, security headers | ✅ | E2E `hosts and SEO` |
| Taxonomy: 48 main categories, 264 subcategories, risk tiers, age ratings, 21 restricted | ✅ | `src/server/catalog/taxonomy.ts`, unit tests |
| Visibility filter (status, security status, disabled/restricted categories incl. parent, listing and category geo rules, age) | ✅ | `tests/db/visibility.test.ts` |
| Homepage rails from `HomepageSection`; rails without real data are hidden | ✅ | DB + E2E tests |
| Categories index, category pages with subcategories, filters, sort, pagination | ✅ | E2E |
| Search: FTS + trigram, prefix and typo tolerance, filters, autocomplete (accessible combobox), suggested searches | ✅ | DB + E2E tests |
| App detail page: trust panel with honest wording, info, features, tags, JSON-LD (no rating unless real), share, report | ✅ | E2E |
| Similar apps, competitors, free / open-source / better-rated alternatives, alternatives page | ✅ | DB tests |
| `/go/:slug` "leaving WebCenter" notice + POST-only tracked redirect (no open redirect) | ✅ | E2E + curl |
| Privacy-preserving outbound click events (daily random salts, deleted after 2 days) | ✅ | DB tests |
| Anonymous listing reports (rate-limited, honeypot) stored for Phase 3 moderation | ✅ | DB + E2E |
| SEO: metadata, canonicals, sitemap (excludes sample and restricted), robots, `noindex` for search and samples | ✅ | E2E |
| Loading skeletons, empty and error states, real 404 status codes | ✅ | E2E |
| Accessibility: axe WCAG 2.1 AA, no serious or critical violations on 6 key pages | ✅ | E2E (desktop + mobile) |
| Dev fixtures: 18 fictional `.example` listings, gated (`--fixtures` + `ALLOW_DEV_FIXTURES=true`, refused in production) | ✅ | `prisma/seed/dev-fixtures.ts` |

**Not in Phase 1 (by design):** favourites (button disabled; needs accounts), reviews (Phase 4),
recommendations (Phase 5), listing view analytics (Phase 5), media uploads (Phase 2), PWA
(Phase 7). The admin and developer hosts are placeholders only.

**Known limitations:**
* Text search ranks at most 500 candidates per query before filtering, which is fine at the
  current scale. The `SearchProvider` boundary allows Meilisearch later.
* Country detection needs a geo header (e.g. Cloudflare's `cf-ipcountry`). Without one, every
  visitor is "unknown" and geo-restricted listings are hidden (`GEO_UNKNOWN_POLICY=deny`).

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
| D0 | **Approve the first production deployment** | After the owner runs `npm run db:check` against Supabase | Going live |
| D8 | Put Cloudflare in front of Hostinger (free)? | Yes: country header for geo rules, DDoS protection, CDN | Accurate geo restrictions |
| D1 | ~~Database hosting~~ | **Decided: Supabase PostgreSQL** (ADR-0007) | — |
| D2 | Object storage provider | Cloudflare R2 | Phase 2 uploads |
| D3 | Transactional email provider | Hostinger SMTP at first, then Postmark or SES | Phase 2 |
| D4 | Apple Developer account for Sign in with Apple (US$99/yr) | Enable later; Google and email first | Phase 2 (Apple only) |
| D5 | Threat-intel providers and budget | Google Web Risk + URLhaus | Phase 6 |
| D6 | Legal review for restricted categories (gambling, adult, forex, crypto) and target markets | Keep these categories `isRestricted` until reviewed | Enabling those categories publicly |
| D7 | Repository name: GitHub repo is currently `webcenta`; spec says `WebCenter` | Rename in GitHub settings if desired (no code depends on it) | Nothing |
