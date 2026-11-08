# ADR-0008: MySQL / MariaDB on Hostinger Business (no Supabase)

Status: Accepted (owner decision) · Date: 2026-11-07 · Supersedes ADR-0002 and ADR-0007

## Context
The owner confirmed Hostinger Business Web Hosting (Node.js web app, GitHub deployment) as the
initial production platform and asked not to use Supabase or any other paid external database.
Hostinger's shared and Business plans provide **MySQL databases, which run MariaDB**, on the same
machine as the Node.js app. Hostinger's guidance is to connect to `127.0.0.1` (Node.js resolves
`localhost` to IPv6 `::1`, which the database user is not granted).

## Decision
* Prisma `mysql` provider with the official `@prisma/adapter-mariadb` driver adapter. It supports
  both MariaDB and MySQL. Supported engines: **MariaDB ≥ 10.6** (Hostinger) and **MySQL ≥ 8.0**
  (a VPS or managed MySQL later). CI runs the database suites on both.
* One MySQL baseline migration replaces the PostgreSQL history (nothing was ever deployed, so no
  data needed converting). No triggers, stored routines or events: shared hosting does not grant
  the privileges they need.
* PostgreSQL features and their replacements:
  | PostgreSQL | MySQL / MariaDB |
  | --- | --- |
  | `tsvector` full-text search | InnoDB `FULLTEXT` on `Listing.searchText`, a search document kept in sync by a Prisma client extension and reconciled hourly |
  | `pg_trgm` typo tolerance | trigram tokens in a `FULLTEXT` column find candidates; exact pg_trgm-style similarity (> 0.3) is computed in the app |
  | 1–2 letter words in FTS | whole-word `REGEXP` (InnoDB does not index tokens shorter than 3 characters) |
  | array columns | JSON arrays; `array_contains` filters |
  | `timestamptz` | `DATETIME(3)` in UTC; every connection forces time zone `+00:00` |
  | case-sensitive text | case-insensitive default collation; secrets and opaque keys use `utf8mb4_bin` |
  | `CHECK` constraints | kept (patterns compare in binary collation), except two on foreign-key columns, which MySQL and MariaDB both forbid; those rules are enforced in the Prisma client extension and tested |
  | `UPDATE … RETURNING … SKIP LOCKED` job claim | `SELECT … FOR UPDATE SKIP LOCKED` + update in one transaction |
  | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` |
  | Row Level Security (Supabase Data API) | not applicable: no public data API exists; access control is in the app |
* Uploads stay on the hosting account's disk by default (`STORAGE_DRIVER=local`, an absolute folder
  outside the app directory), so no paid storage service is needed. S3-compatible storage remains
  optional.
* The app builds with `next build --webpack` (Hostinger's documented workaround for Next.js ≥ 16.3.3)
  and runs as a Next.js standalone server, as Hostinger runs it.

## Consequences
* Search ranking differs slightly from PostgreSQL's; the search test suite passes unchanged.
* Database-level guarantees that MySQL cannot express live in one place (`src/server/db.ts`) and
  are covered by `tests/db/schema.test.ts`.
* Portability: the same code and migrations run on a Hostinger VPS or DigitalOcean with MariaDB or
  MySQL 8. Moving back to PostgreSQL would need a new migration set and the search module.
