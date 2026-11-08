# Webcenta — Database Design

Engine: **MySQL / MariaDB** (production: **Hostinger MySQL, which runs MariaDB ≥ 10.6**; MySQL ≥ 8.0
also supported) · ORM: **Prisma 7** with `@prisma/adapter-mariadb` · Schema: [`prisma/schema/`](../prisma/schema)
· Decision: [ADR-0008](adr/0008-mysql-mariadb-hostinger.md)

The baseline migration is `prisma/migrations/*_mysql_baseline` (it replaced the earlier PostgreSQL
migrations before anything was deployed, so no data was converted). Every schema change from now on
ships as a committed migration; `db push` is for local experiments only. CI applies the migrations
to fresh MariaDB 10.11 and MySQL 8.0 databases and checks for drift (`prisma migrate diff --exit-code`).

Conventions: InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` (case-insensitive), `DATETIME(3)` in UTC (every
connection sets time zone `+00:00`), JSON arrays for lists, `TEXT`/`MEDIUMTEXT` for long text.
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

61 tables in total (60 models plus Prisma's `_prisma_migrations`).

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
  append-only tables (`ListingEvent`, `InteractionEvent`, `AuditLog`) use `BIGINT AUTO_INCREMENT`.

## 3. Hand-written SQL and rules outside Prisma's schema

Appended to the generated baseline and marked `HAND-WRITTEN`:

| What | Why |
| --- | --- |
| `utf8mb4_bin` collation on `Session.token`, `AdminSession.tokenHash`, `AdminInvitation.tokenHash`, `Verification.identifier`, `MediaAsset.storageKey` | Secrets and opaque keys must compare exactly; the default collation is case-insensitive. |
| CHECK constraints: rating 1–5, ISO country format, slug format, `https://` website URLs, rating-average range | Integrity at the database level. Patterns compare in a binary collation, so they are case-sensitive. Prisma ignores CHECKs in diffs. |

Deliberately **not** used: triggers, stored procedures, functions and events. Managed (shared)
hosting does not grant the privileges they need.

Rules enforced in application code (`src/server/db.ts`, a Prisma client extension) because MySQL and
MariaDB forbid CHECK constraints on columns with foreign-key actions, or because they need code:

| Rule | Where it is tested |
| --- | --- |
| A `GeoRestriction` targets exactly one listing or one category | `tests/db/schema.test.ts` |
| A `Category` is never its own parent | `tests/db/schema.test.ts` |
| `Listing.searchText` / `searchTrigrams` stay in sync with name, tagline, publisher, features and description (creates compute them; content updates recompute them from the current row in the same statement; `updateMany` on content is refused) | `tests/db/schema.test.ts`, `tests/unit/trigrams.test.ts` |

**Upserts:** on MySQL / MariaDB Prisma runs `upsert` as a read followed by an insert, so two
concurrent upserts of the same missing row can collide. The client extension retries an `upsert`
that hits a unique violation (Prisma's documented remedy); `tests/db/concurrency.test.ts` covers it.

The hourly maintenance job also re-derives search columns for recently changed listings
(`reconcileSearchDocuments`), so a missed write path cannot leave search stale for long.

**Search** (`src/server/search/search.ts`): InnoDB `FULLTEXT` indexes on `Listing.name`,
`Listing.searchText` and `Listing.searchTrigrams`. Words of 3+ characters match as required
prefixes in boolean mode; 1–2 character words ("ai", "3d") match as whole words with `REGEXP`
(InnoDB's minimum token size is 3); name and publisher substrings, tag and category names match with
`LIKE`; typos match through trigram tokens with a pg_trgm-compatible similarity above 0.3, computed
in `src/lib/trigrams.ts`.

**Rule for future migrations:** use only standard DDL (tables, columns, indexes, foreign keys,
CHECKs); keep JSON defaults in the Prisma schema (`@default("[]")`), not in SQL; run the migration on
both MariaDB and MySQL (CI does).

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

## 5. Production database user

Hostinger provides one user per database, with full privileges on it. The app and migrations use
that user. On a VPS, split it into a migration user (DDL) and an app user (DML only; `INSERT, SELECT`
on `AuditLog`).

## 6. Backups

See [DEPLOYMENT.md §5](DEPLOYMENT.md): Hostinger backups, `scripts/backup.sh` (mysqldump /
mariadb-dump, consistent snapshot) and `scripts/restore-drill.sh` (restore into an empty database,
exact row counts plus constraint, index and collation checks). CI runs the drill on every push.
