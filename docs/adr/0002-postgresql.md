# ADR-0002: PostgreSQL as the primary database

Status: **Superseded** by ADR-0008 (MySQL / MariaDB on Hostinger, 2026-11-07) · Date: 2026-11-06

## Context
Hostinger managed Node.js hosting bundles MySQL/MariaDB, not PostgreSQL. The product needs
full-text search with ranking, fuzzy matching (autocomplete and lookalike domains), JSON
documents (revisions, scan evidence), arrays, strict constraints, and a reliable job queue
without Redis.

## Decision
Use **PostgreSQL 15+**, hosted as a managed service in the region nearest the app at first. Use
`pg_trgm`, generated `tsvector` columns and `FOR UPDATE SKIP LOCKED`.

## Consequences
+ One datastore covers relational data, search (initially) and the job queue.
+ Trivial migration to a VPS-hosted or other managed Postgres (`pg_dump`/`pg_restore`).
− Adds an external service and possible cross-provider latency. This is mitigated by choosing the
  same region and by caching.
− Alternative: MySQL on Hostinger. It is possible, since Prisma supports it, but FULLTEXT
  relevance is weaker, there is no trigram index, `SKIP LOCKED` needs MySQL 8 rather than MariaDB
  defaults, and CHECK and array support is weaker. Switching later would be costly, so the
  decision is made now while no data exists.
