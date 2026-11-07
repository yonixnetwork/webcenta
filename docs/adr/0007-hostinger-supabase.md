# ADR-0007: Initial production on Hostinger Business + Supabase PostgreSQL

Status: **Superseded** by ADR-0008 (Supabase dropped; Hostinger MySQL / MariaDB) · Date: 2026-11-06

## Context
The owner has purchased Hostinger Business hosting, which supports Node.js web apps but not
PostgreSQL, Redis, Docker, permanent workers or inbound WebSockets. A later move to Hostinger VPS
or DigitalOcean must not require a rewrite.

## Decision
* The app (Next.js) runs on Hostinger Business, deployed from GitHub.
* The database is Supabase PostgreSQL, used as **plain Postgres only**: no Supabase Auth, Storage,
  Realtime, Edge Functions or client SDK.
  * Runtime: transaction pooler (6543), small node-postgres pool, TLS verified with Supabase's CA.
  * Migrations: session pooler (5432) via `DIRECT_URL` from a trusted machine, not the build.
  * Extensions in the `extensions` schema (Supabase convention, also created locally).
  * RLS enabled on every table and Data API roles revoked, because Supabase exposes `public`
    via PostgREST.
* Scheduled work: Hostinger Cron → `POST /api/cron/tick` (bearer secret) → DB-backed job queue.

## Consequences
+ Works within shared-hosting limits; Supabase gives managed backups and Postgres features
  (FTS, pg_trgm, SKIP LOCKED).
+ Leaving Supabase = `pg_dump`/`pg_restore` + changing two URLs.
− Cross-provider latency: choose the Supabase region nearest Hostinger's datacentre.
− Every future migration that adds a table must enable RLS; enforced by tests and `npm run db:check`.
