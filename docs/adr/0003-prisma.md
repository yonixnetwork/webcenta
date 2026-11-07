# ADR-0003: Prisma 7 ORM with a multi-file schema

Status: Accepted · Date: 2026-11-06

## Decision
Use Prisma 7 (`prisma-client` generator, `prisma.config.ts`) with the schema split per domain in
`prisma/schema/`. Migrations are committed from Phase 1. Features Prisma can't model go into
migrations as raw SQL. Since ADR-0008 the provider is `mysql` with the `@prisma/adapter-mariadb`
driver adapter; the raw SQL is limited to collations and CHECK constraints.

## Consequences
+ A typed data layer, readable schema and reviewable migrations.
− Some SQL lives outside the Prisma schema; it is documented in docs/DATABASE.md §3.
