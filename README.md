# WebCenter

**WebCenter** (`webcenter.com`) is a global discovery marketplace for websites, web applications,
online services, AI products and digital platforms. You browse, compare, review and safely visit
web apps, much as you would in an app store, but for the open web.

> **Current status: Phase 0 — architecture and schema.** There is no user-facing application yet.
> See [docs/ROADMAP.md](docs/ROADMAP.md) for exactly what is implemented and what is planned.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, technology choices, domain/subdomain routing, key flows |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema overview, design decisions, raw-SQL additions, retention, backups |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, admin isolation, RBAC, SSRF-safe scanning, monitoring, privacy |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hostinger → VPS → cloud migration path, costs, release checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phases, implementation status, open decisions |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Stack (planned; see ADRs)

Next.js 16 · TypeScript · PostgreSQL · Prisma 7 · Better Auth · Tailwind CSS + Radix UI ·
S3-compatible storage · database-backed job queue driven by cron.

## Local development (Phase 0)

Requirements: Node.js ≥ 22, PostgreSQL ≥ 15.

```bash
cp .env.example .env          # set DATABASE_URL to a local, disposable database
npm install
npm run db:validate           # validate the Prisma schema
npm run db:generate           # generate the typed client
npm run db:push:dev           # apply schema to the local dev DB (no migrations until Phase 1)
npm run db:smoke              # run the schema smoke test (disposable DB only)
```

## Security

Never commit `.env` files, API keys, credentials or private keys. Report security issues privately
to the maintainers instead of opening a public issue.
