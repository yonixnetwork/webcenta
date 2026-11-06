# WebCenter — Database Design

Engine: **PostgreSQL 15+** (production: **Supabase**) · ORM: **Prisma 7** · Schema: [`prisma/schema/`](../prisma/schema)

The baseline migration is `prisma/migrations/*_init`. Every schema change from now on ships as a
committed migration; `db push` is for local experiments only. CI applies the migrations to a fresh
database that simulates Supabase's `anon`/`authenticated` roles, then checks for drift
(`prisma migrate diff --exit-code`) and RLS coverage.

## 1. Domain map

| File | Tables | Purpose |
| --- | --- | --- |
| `identity.prisma` | User, Session, Account, Verification, AuthEvent, RateLimitBucket | Public accounts (shared by the marketplace and the developer portal). Shape is compatible with Better Auth. |
| `catalog.prisma` | Category, Tag, Listing, ListingCategory, ListingTag, MediaAsset, ListingMedia, ListingRevision, ListingStatusChange, ListingRelation, GeoRestriction | Taxonomy and listings. |
| `developer.prisma` | DeveloperOrg, DeveloperMember, DomainVerification, ComplianceDocument, ListingClaim | Developer organisations and trust evidence. |
| `community.prisma` | Review, ReviewReply, ReviewHelpfulVote, Favorite, Collection, CollectionItem, Notification | User-generated content. |
| `moderation.prisma` | Report, ModerationAction, Appeal, SupportCase, SupportCaseMessage | Trust and safety operations. |
| `analytics.prisma` | ListingEvent, ListingDailyStat, ListingDailyDimensionStat, SearchQueryDailyStat, InteractionEvent, UserInterest | Privacy-conscious analytics and personalisation. |
| `security.prisma` | SecurityScan, SecurityCheckResult, SecurityAlert, MonitoringPolicy | Scanning and continuous monitoring. |
| `admin.prisma` | AdminUser, AdminSession, AdminInvitation, AdminLoginEvent, AuditLog | Isolated admin identity and the audit trail. |
| `platform.prisma` | HomepageSection, FeaturedPlacement, SystemSetting, LegalPolicy, DeveloperPlan, DeveloperSubscription, Sponsorship | Platform configuration and future monetisation (inactive). |
| `jobs.prisma` | Job, JobRun | Database-backed job queue. |

58 tables in total.

## 2. Important design decisions

* **Live row vs revisions.** `Listing` holds only approved, public content. Developer edits go to
  `ListingRevision.data` (JSON validated by zod) and are copied onto `Listing` on approval. This
  prevents "submit = publish" and keeps a full history.
* **Status history.** `ListingStatusChange` is an append-only record of every transition, and also
  feeds verification history in the admin UI.
* **Developer-declared vs enforced countries.** `Listing.supportedCountries` is informational.
  `GeoRestriction` rows (per listing or per category) are enforced by the visibility filter.
* **Credit for editorial listings.** `publisherName` is required on every listing. Editorial
  listings record `editorialSource` and `editorialEvidence`. `developerId` stays null until a claim
  is approved.
* **No fake verified-review badges.** `Review.isVerifiedUsage` defaults to `false`. No mechanism
  sets it yet; one would need a developer integration.
* **Audit log independence.** `AuditLog.actorUserId` deliberately has no foreign key, so deleting a
  user (GDPR erasure) does not erase the record of their actions. The admin FK uses `SET NULL`.
  Audit metadata must never contain secrets or full personal data.
* **Denormalised counters.** `ratingCount`, `ratingAverage`, `favoriteCount`, `helpfulCount`,
  `popularityScore` and `trendingScore` are updated transactionally and reconciled nightly by a job.
* **Monetisation tables exist but are inactive.** `DeveloperPlan.isActive` defaults to `false` and
  `priceCents` is nullable until pricing is decided.
* **IDs.** UUIDv7 strings, which are time-ordered and give good B-tree locality. High-volume
  append-only tables (`ListingEvent`, `InteractionEvent`, `AuditLog`) use `BIGSERIAL`.

## 3. Hand-written SQL in the baseline migration

Prisma cannot express these, so they are appended to the generated migration and marked `HAND-WRITTEN`:

| What | Why |
| --- | --- |
| `CREATE SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions` | Supabase convention; trigram search and autocomplete. Queries use `extensions.similarity(...)`. |
| `Listing.searchVector` filled by trigger `webcenter_listing_search_vector()` | Weighted FTS (name A; tagline/publisher B; features C; description D) using the `'simple'` config for a multilingual catalogue. A trigger is used because a generated column cannot call the non-IMMUTABLE `array_to_string`. |
| GIN indexes on `searchVector` and on `name` (`extensions.gin_trgm_ops`) | Declared in the Prisma schema too, so there is no drift. The schema names the opclass unqualified because that is what introspection reports. |
| CHECK constraints: rating 1–5, geo restriction has exactly one target, ISO country format, no self-parent category, slug format, `https://` website URLs, rating-average range | Integrity at the database level. Prisma ignores CHECKs in diffs. |
| `ENABLE ROW LEVEL SECURITY` on every table in `public` | Supabase exposes `public` via its Data API. With RLS and no policies, those roles see nothing. The app connects as the table owner, which bypasses RLS. |
| `REVOKE ALL` and `ALTER DEFAULT PRIVILEGES … REVOKE` from `anon` and `authenticated` (only if those roles exist) | Defence in depth, including for tables created by later migrations. |

**Rule for future migrations:** every new table must get `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
`tests/db/schema.test.ts` and `npm run db:check` fail otherwise.

## 4. Data retention (defaults; configurable in SystemSetting)

| Data | Retention |
| --- | --- |
| `ListingEvent` (raw) | 35 days, then roll-ups only |
| `InteractionEvent` | 180 days, or until the user clears it |
| `AuthEvent`, `AdminLoginEvent` | 180 days / 2 years |
| `AuditLog` | ≥ 2 years (append-only) |
| `SecurityScan` + results | 1 year (alerts retained as long as the listing exists) |
| `Session` / `Verification` / `RateLimitBucket` | Purged after expiry |
| Users requesting deletion | Purged after a 30-day grace period; reviews deleted or anonymised per policy |

## 5. Production database roles

* `webcenter_migrate`: owns the schema and runs `prisma migrate deploy` during deployment.
* `webcenter_app`: DML only. `INSERT, SELECT` on `AuditLog` (no `UPDATE` or `DELETE`). No DDL.
* `webcenter_readonly`: for analytics and backups verification.

## 6. Backups

* Managed Postgres point-in-time recovery, where the provider offers it.
* A nightly `pg_dump` (custom format) to object storage in a separate account or bucket, with
  30-day retention.
* A quarterly **restore drill** into a scratch database, with the result recorded in
  `docs/operations/restore-log.md`. This is a Phase 7 task and has not been done yet.
