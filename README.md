# Webcenta

**Webcenta** (`webcenta.com`) is a global discovery marketplace for websites, web applications,
online services, AI products and digital platforms. You browse, compare and safely visit web apps,
much as you would in an app store, but for the open web.

> **Status: all planned phases implemented and integration-tested (227 unit/DB tests on MariaDB and MySQL, 112 E2E tests).
> Not deployed.** See [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) for evidence and unverified items.

| Desktop | Mobile |
| --- | --- |
| ![Home, dark](docs/screenshots/home-desktop-dark.png) | ![App page, dark](docs/screenshots/app-mobile-dark.png) |
| ![Categories, light](docs/screenshots/categories-desktop-light.png) | ![Page not found, dark](docs/screenshots/not-found-mobile-dark.png) |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · MySQL / MariaDB (Hostinger
MySQL in production) · Prisma 7 · Vitest · Playwright + axe.
Hosting: Hostinger Business (Node.js web app from GitHub), Hostinger MySQL, Hostinger Cron. No
external database or paid service is required. See [ADR-0008](docs/adr/0008-mysql-mariadb-hostinger.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, host routing, key flows |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, MySQL specifics, search, integrity rules, retention |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, admin isolation, RBAC, SSRF-safe scanning, privacy |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hostinger runbook (Node.js app, MySQL, cron), env vars, backups, migration path |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Implementation status, open decisions |
| [docs/TESTING.md](docs/TESTING.md) | Test suites, E2E setup, the ten user journeys |
| [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) | Final verification report, risks, deployment summary |
| [docs/adr/](docs/adr/) | Architecture decision records |

## Local development

Requirements: Node.js 22, MariaDB ≥ 10.6 or MySQL ≥ 8.0.

```bash
cp .env.example .env                          # DATABASE_URL=mysql://USER:PASS@127.0.0.1:3306/webcenta_dev
npm install                                   # also runs prisma generate
npx prisma migrate deploy                     # apply migrations
ALLOW_DEV_FIXTURES=true npm run db:seed -- --fixtures   # taxonomy + FICTIONAL sample listings
npm run dev                                   # http://localhost:3000
# Production-like: npm run build && npm start (the standalone server Hostinger runs)
```

Admin portal: run `npm run admin:provision -- --email you@example.com`, open the printed link on
`http://admin.localhost:3000`, set a password and enrol TOTP. Scheduled jobs: `npm run jobs:tick`.

| Command | Purpose |
| --- | --- |
| `npm run lint` / `npx tsc --noEmit` | Lint and typecheck |
| `npm test` | Unit and database integration tests (needs a migrated and seeded DB) |
| `npm run build && E2E_DB_BASE=… bash tests/e2e/run-fresh.sh` | Production build and the full Playwright suite on a fresh DB (see docs/TESTING.md) |
| `npm run db:check` | Read-only compatibility report for a target database (e.g. Hostinger MySQL) |
| `npm run db:seed` | Seed real configuration (taxonomy, homepage sections, monitoring policy) |
| `npm run brand:check` | Fail if the retired product name appears anywhere |
| `npm run errors:generate` | Regenerate the static fallback error pages in `public/errors/` |

## Security

Never commit `.env` files, API keys, credentials or private keys. Report security issues privately
to the maintainers instead of opening a public issue.
