# WebCenter — Database Design

Engine: **PostgreSQL 15+** · ORM: **Prisma 7** · Schema: [`prisma/schema/`](../prisma/schema)

The schema has been checked against a real PostgreSQL 16 instance with `prisma db push` and the
smoke test `npm run db:smoke` (13 checks). **No migration has been committed yet.** The baseline
migration is generated in Phase 1, once the first code uses the schema, so that early changes
don't pile up as migration noise. From Phase 1 on, every schema change ships as a committed
migration. `db push` is for local experiments only.

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

## 3. Raw SQL to add in the Phase 1 baseline migration

Prisma cannot express these, so they go in the migration SQL by hand:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Full-text search vector (weighted) on listings
ALTER TABLE "Listing" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("publisherName", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) STORED;
CREATE INDEX "Listing_searchVector_idx" ON "Listing" USING GIN ("searchVector");
CREATE INDEX "Listing_name_trgm_idx" ON "Listing" USING GIN (name gin_trgm_ops);  -- autocomplete / typo tolerance

-- Integrity checks
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "GeoRestriction" ADD CONSTRAINT "GeoRestriction_one_target"
  CHECK (("listingId" IS NULL) <> ("categoryId" IS NULL));
ALTER TABLE "Category" ADD CONSTRAINT "Category_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> id);

-- Partial index for the public catalogue
CREATE INDEX "Listing_public_idx" ON "Listing" ("publishedAt" DESC)
  WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL;
```

Feature bullets and tag names are added to the search vector through a trigger in Phase 1, because
generated columns cannot reference other tables. The `'simple'` configuration is used because the
catalogue is multilingual. Per-language configurations can be added later.

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
