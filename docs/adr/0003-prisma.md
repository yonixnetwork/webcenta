# ADR-0003: Prisma 7 ORM with a multi-file schema

Status: Accepted · Date: 2026-11-06

## Decision
Use Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter, `prisma.config.ts`)
with the schema split per domain in `prisma/schema/`. Migrations are committed from Phase 1.
Features Prisma can't model (tsvector, GIN/trigram indexes, CHECK constraints, partial indexes)
go into migrations as raw SQL.

## Consequences
+ A typed data layer, readable schema and reviewable migrations.
− Some SQL lives outside the Prisma schema; it is documented in docs/DATABASE.md §3.
