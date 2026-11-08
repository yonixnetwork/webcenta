# Webcenta — Deployment

> **Status:** nothing has been deployed. Production deployment happens only after the owner
> approves it. This document is the runbook for that moment.

## 1. Confirmed hosting stack (initial production)

| Concern | Service | Notes |
| --- | --- | --- |
| Application | **Hostinger Business** web hosting, **Node.js web app** | Already purchased. Deployed from GitHub; Hostinger builds Next.js and runs its standalone server. |
| Database | **Hostinger MySQL** (runs **MariaDB**) on the same account | Connect to `127.0.0.1:3306`. No external database service. See [ADR-0008](adr/0008-mysql-mariadb-hostinger.md). |
| Source & deploy | **GitHub** (`main` branch) → Hostinger GitHub integration | The repository is the source of truth. |
| Scheduled tasks | **Hostinger Cron Jobs** | Calls `POST /api/cron/tick` over HTTPS. |
| Uploaded files | The hosting account's disk, in a folder **outside** the app directory | Served by the app at `/media/…`. S3-compatible storage (e.g. Cloudflare R2) is optional. |
| Email | Hostinger mailbox over SMTP | Included with the plan. |

No Supabase, Redis, Docker, permanent worker, WebSocket or paid add-on is required.

### Hostinger Business constraints the code respects

| Constraint | How Webcenta handles it |
| --- | --- |
| No permanent background workers | `Job` table + cron-triggered, time-boxed ticks (`JOBS_TICK_BUDGET_MS`, default 25 s). |
| No Redis | Rate limits and job queue in MySQL; in-process TTL caches. |
| No Docker, no root | Plain Node.js app. Migrations use no triggers, stored routines or events (shared hosting does not grant those privileges). |
| No inbound WebSockets | No realtime features; notifications use polling. |
| Limited database connections per user | Small pool (`DATABASE_POOL_MAX`, default 5). |
| App directory replaced on redeploy | Uploads go to an absolute folder outside it (enforced in production) or to S3. |
| Turbopack builds fail on Hostinger's build servers for Next.js ≥ 16.3.3 | `npm run build` uses `next build --webpack` (Hostinger's documented fix). |
| Build may install production dependencies only (not documented) | Everything the build needs (Prisma CLI, TypeScript, Tailwind, PostCSS, tsx, dotenv) is in `dependencies`; CI checks this. |

**Hostinger facts this relies on** (from Hostinger's help centre and docs, November 2026):
Node.js web apps need a Business or Cloud plan; supported Node.js versions are 18, 20, 22 and 24,
pre-selected from `package.json` `engines` (Webcenta pins `22.x`); the build command is chosen from
`package.json` scripts; for Next.js the output directory is `.next` and Hostinger starts the
standalone server itself; environment variables are entered (or a `.env` imported) in hPanel and
need a redeploy to apply; databases are MySQL (MariaDB) and Node.js apps must use host `127.0.0.1`.

**Verify in hPanel before the first deploy (not verifiable from this repository):** the exact
MariaDB version (`SELECT VERSION();` in phpMyAdmin; ≥ 10.6 required); whether devDependencies are
installed during the build (not required any more); memory available to `next build`; the cron
minimum interval; that `admin.` and `developers.` subdomains can point to the same Node.js app; that
a folder outside the app directory survives redeploys (for uploads).

## 2. Database setup on Hostinger (owner actions)

1. hPanel → **Websites** → webcenta.com → **Databases** → **MySQL Databases** → create a database
   and a user with a strong password. Hostinger prefixes both, e.g. `u123456789_webcenta`.
2. Build the connection URL (URL-encode special characters in the password: `@` → `%40`,
   `:` → `%3A`, `/` → `%2F`, `#` → `%23`):
   ```
   mysql://u123456789_webcenta:PASSWORD@127.0.0.1:3306/u123456789_webcenta
   ```
   Use `127.0.0.1`, not `localhost`.
3. Check the server version in hPanel → **phpMyAdmin** → SQL: `SELECT VERSION();` (MariaDB ≥ 10.6).
4. Create the tables. Choose one:
   * **In the app** (recommended, no terminal): deploy with `SETUP_TOKEN` set and use
     `https://admin.webcenta.com/setup` (§4 step 3).
   * **From your computer**: hPanel → Databases → **Remote MySQL** → allow your IP, then run
     `npx prisma migrate deploy && npm run db:seed` with `DATABASE_URL` pointing at the remote host
     Hostinger shows (e.g. `srv123.hstgr.io`). Remove remote access afterwards.
   * **Over SSH**: the same commands in the app directory with `DATABASE_URL` using `127.0.0.1`.

## 3. Environment variables (hPanel → Node.js app → Environment variables)

Only the values the server needs **before it can reach the database** live in the hosting
environment. Every integration (email, sign-in providers, storage, scanners, analytics, payments,
cron secret, security options…) is configured in **Admin → Settings** and stored in MySQL, with
credentials encrypted. See [`docs/SETTINGS.md`](SETTINGS.md).

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | `mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE` (§2). The dashboard cannot change it: it needs the database to read anything. |
| `FIELD_ENCRYPTION_KEY` | **yes** | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts saved credentials and admin TOTP seeds and derives the session secret. **Keep a copy; never change it** (changing it means re-entering saved credentials, signing everyone out and re-enrolling admin 2FA). |
| `PUBLIC_ORIGIN` | **yes** | `https://webcenta.com`. Admin and developer origins default to `admin.` / `developers.` subdomains. |
| `NODE_ENV=production` | **yes** | |
| `SETUP_TOKEN` | first deploy only | ≥ 32 characters (`openssl rand -hex 32`). Opens `https://admin.webcenta.com/setup` while no Super Administrator exists. Remove it afterwards. |
| `ADMIN_ORIGIN`, `DEVELOPER_ORIGIN` | no | Only for non-standard hostnames |
| `USER_AUTH_SECRET` | no | Derived from `FIELD_ENCRYPTION_KEY` when unset. If you already set one, keep it (removing it signs users out once). |
| `DATABASE_POOL_MAX`, `DIRECT_URL`, `DATABASE_SSL`, `DATABASE_SSL_CA` | no | Pool size; Prisma CLI URL; TLS for a remote database only |
| `MAINTENANCE_MODE`, `MAINTENANCE_RETRY_AFTER` | no | Maintenance page without touching the database (§5a) |
| `SCANNER_ALLOW_PRIVATE_FOR_TESTS`, `ENABLE_TEST_ERROR_ROUTES`, `ALLOW_DEV_FIXTURES` | **must be unset** | Test only |

**Optional fallbacks.** The older integration variables (`SMTP_*`, `EMAIL_TRANSPORT`, `EMAIL_FROM`,
`CRON_SECRET`, `JOBS_TICK_BUDGET_MS`, `STORAGE_*`, `S3_*`, `MEDIA_PUBLIC_BASE_URL`, `GOOGLE_*`,
`APPLE_*`, `GOOGLE_WEB_RISK_API_KEY`, `URLHAUS_AUTH_KEY`, `VIRUSTOTAL_API_KEY`, `ADMIN_IP_ALLOWLIST`,
`GEO_*`, `TRUSTED_PROXY_HOPS`, `SITE_BANNER`) still work: each is used only while nothing has been
saved for that field in the dashboard. A value saved in Admin → Settings always wins. `ADMIN_AUTH_SECRET`
is no longer used and can be deleted.

Hostinger replaces the whole variable list on save; values read back masked. After changing
variables, restart or redeploy the app.

## 4. Deploy procedure (after the owner's approval)

1. **CI green** on the commit to deploy (`.github/workflows/ci.yml`: MariaDB 10.11 job with the
   brand check, lint, typecheck, unit/DB tests, smoke test, restore drill, the Hostinger-style build,
   the bundle secret scan and the E2E suite on the standalone server; MySQL 8.0 job with the database
   suites).
2. **Hostinger Node.js app:** see step 4 below; set the §3 variables including `SETUP_TOKEN`, then deploy.
3. **First-time setup** (no terminal needed): open `https://admin.webcenta.com/setup`, enter the
   setup token, click **Create tables and base data** (applies the database migrations and the
   base data: categories, homepage sections, monitoring policies, plans, DRAFT legal templates),
   then **Create owner invitation** with your email. Open the single-use link (valid 72 hours),
   set a password and enrol TOTP, sign in, and configure **Settings** (email first, then test it).
   Remove `SETUP_TOKEN` afterwards. The page answers 404 once a Super Administrator exists.

   Command-line alternative (Remote MySQL or SSH): `npx prisma migrate deploy`, `npm run db:seed`,
   `npm run db:check`, then `npm run admin:provision -- --email you@yourcompany.com`.
   **Never** pass `--fixtures` in production. Later upgrades that add migrations: Admin →
   Settings → Database → **Apply pending migrations** (Super Administrators; take a backup first),
   or `npx prisma migrate deploy`. Both use the same `_prisma_migrations` table.
4. **Hostinger Node.js app:** hPanel → Websites → **Add website** → **Node.js Apps** → import from
   GitHub → repository `yonixnetwork/webcenta`, branch `main`. Settings:
   | Setting | Value |
   | --- | --- |
   | Framework / application type | Next.js |
   | Node.js version | 22.x (pre-selected from `engines`) |
   | Build command (script) | `build` (runs `prisma generate && next build --webpack`) |
   | Output directory | `.next` |
   | Start / entry file | not needed for Next.js (Hostinger starts the standalone server) |
   Enter the variables from §3, then deploy.
5. **Domains & SSL:** attach `webcenta.com`, `www.`, `admin.` and `developers.` to the app with HTTPS.
   The app redirects `www` → apex and `developers.` → `/developer`, and serves the admin portal only
   on `admin.`. `api.webcenta.com` is optional: if attached, it serves `/api/*` only (public
   endpoints; no session cookies reach it) and redirects every other path to `webcenta.com`.
   Optionally upload `public/errors/*.html` as the host's or Cloudflare's custom error pages (§5a).
6. **Cron** (hPanel → Advanced → Cron Jobs), every 10 minutes:
   ```bash
   curl -fsS -m 60 -X POST -H "Authorization: Bearer <CRON_SECRET>" https://webcenta.com/api/cron/tick
   ```
   Check Admin → Jobs & email: "Last scheduler run" should be recent.
7. **Smoke test:** `/api/health` → `{"ok":true}`; register a test account (the email arrives); admin
   login with MFA; upload a logo and redeploy, then confirm the logo still loads (proves the storage
   folder survives deploys); publish one real editorial listing and check its page, search,
   `/go/…`, sitemap and robots; check that `admin.` responses carry `x-robots-tag: noindex`.
8. **Backups:** §5.
9. **Rollback:** redeploy the previous commit in hPanel. Migrations are additive; restore from a
   backup if data was damaged.

### Staging (recommended before production)
Use a second Hostinger database and a subdomain (e.g. `staging.webcenta.com`) with
`SITE_BANNER="Staging"`, `EMAIL_TRANSPORT=log`, and a separate `CRON_SECRET`. Fictional fixtures
may be loaded there **only** with `ALLOW_DEV_FIXTURES=true`. Staging has **not** been performed.

## 5a. Error pages, maintenance and outages

What the application itself guarantees (tested E2E):

| Situation | Response |
| --- | --- |
| Unknown URL, unknown or hidden app, unknown category | **404**, branded page with search and popular categories; for `/app/…`, suggestions from the same category and alternatives, with a generic reason (no moderation details) |
| Unknown `/api/…` path | **404** JSON `{"error":"Not found"}` |
| Admin role lacks a permission; developer role too low | **403** page at the requested URL; admin denials are written to the audit log |
| Unhandled server error | **500** branded page with a "Try again" button and an error reference (says "offline" instead if the browser has no connection) |
| `MAINTENANCE_MODE=true` | **503** with `Retry-After`, served by `src/proxy.ts` without touching the database; JSON 503 for `/api/*`; admin portal and `/api/cron/*` still work |
| Visitor's device is offline | Service worker shows the precached offline page with a Retry that checks the network |

**When the Node.js app itself is down or unreachable**, the app cannot answer, so whatever sits in
front of it decides what visitors see. Hostinger's generic error page will appear unless one of these
is configured. The self-contained pages in `public/errors/` (`404`, `500`, `502`, `503`; inline CSS,
no scripts, no external requests; regenerate with `npm run errors:generate`) are meant for that:

1. **Hostinger:** whether a Node.js web app on the Business plan can use custom error pages for
   upstream failures is **not verified** (no hPanel access during the build). Check hPanel; if it
   accepts custom pages, upload `public/errors/502.html` and `503.html`.
2. **Cloudflare in front of Hostinger (D8):** Cloudflare can show custom pages for 5xx and
   connection errors. Which error types can be customised depends on the Cloudflare plan; check
   current pricing before relying on it, and treat any paid plan as an owner decision. Upload or
   point Cloudflare to the `public/errors/*.html` pages.
3. **Neither configured:** visitors see the hosting provider's page during an outage. Use an external
   uptime monitor to find out quickly.

Limits, stated plainly: the `public/errors/*.html` files are served by the app too
(`/errors/503.html`), so they only help during an outage if the host or Cloudflare stores its own copy.
Changing `MAINTENANCE_MODE` requires setting the variable in hPanel and restarting the app.

## 5. Backups

* **Hostinger:** hPanel → **Backups** includes database backups (frequency depends on the plan;
  check hPanel). phpMyAdmin → Export makes an on-demand copy.
* **Independent copy:** `scripts/backup.sh` (needs `mariadb-dump` or `mysqldump`) from a trusted
  computer with Remote MySQL access, or over SSH. Store the files off the hosting account.
* **Restore drill:** `scripts/restore-drill.sh` restores a backup into an empty scratch database and
  compares exact row counts, constraints, foreign keys, FULLTEXT indexes and collations. CI runs it
  on every push (MariaDB and MySQL). Run it quarterly against a real backup.
* Uploaded files in `STORAGE_LOCAL_DIR` are not in the database: include that folder in your backups
  (Hostinger's file backups cover the home directory).

## 6. Migration path (no rewrite required)

| Target | What changes | What stays |
| --- | --- | --- |
| Hostinger VPS / DigitalOcean Droplet | Run `npm start` (the standalone server) under systemd or pm2 behind Caddy/Nginx; run `npm run jobs:tick` from system cron; install MariaDB ≥ 10.6 or MySQL 8 (or use a managed MySQL with TLS: `DATABASE_SSL=verify-full`); move data with `scripts/backup.sh` / restore; optionally add Redis and Meilisearch behind the existing interfaces; move the scanner to its own isolated host. | All application code, schema, migrations and env-var names. |
| Managed cloud (containers) | Add a Dockerfile at that time; horizontal scaling works because the web tier is stateless (use S3 storage). | Same. |

Things deliberately avoided so this stays true: database-vendor SDKs, triggers and stored routines,
Vercel-only APIs, hosting-specific file paths, Edge-only runtime features.

## 7. Costs to approve before use

| Service | When | Cost note (check current pricing) |
| --- | --- | --- |
| Hostinger Business | Now | Already purchased; includes MySQL databases, email, cron, SSH and backups |
| Cloudflare (DNS/proxy) | Optional | Free plan provides the `CF-IPCountry` header and DDoS protection |
| Object storage (R2/B2) | Optional | Not needed: uploads use the hosting disk |
| Google Web Risk, VirusTotal | Optional | Paid for commercial use; abuse.ch URLhaus is free with an account |
| Apple Developer Program | Sign in with Apple | US$99/year |
