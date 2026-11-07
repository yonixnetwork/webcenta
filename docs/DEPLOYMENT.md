# Webcenta — Deployment

> **Status:** nothing has been deployed. Production deployment happens only after the owner
> approves it. This document is the runbook for that moment.

## 1. Confirmed hosting stack (initial production)

| Concern | Service | Notes |
| --- | --- | --- |
| Application | **Hostinger Business** web hosting, Node.js web app | Already purchased. Runs `next start`. |
| Database | **Supabase PostgreSQL** | Runtime via Supavisor **transaction** pooler (port 6543); migrations via **session** pooler (port 5432). |
| Source & deploy | **GitHub** (`main` branch) → Hostinger Git deployment | The repository is the source of truth. |
| Scheduled tasks | **Hostinger Cron Jobs** | Calls `POST /api/cron/tick` over HTTPS. |
| Files (Phase 2+) | External S3-compatible object storage (e.g. Cloudflare R2) | Not needed until uploads exist. |

### Hostinger Business constraints the code respects

| Constraint | How Webcenta handles it |
| --- | --- |
| No permanent background workers | `Job` table + cron-triggered, time-boxed ticks (`JOBS_TICK_BUDGET_MS`, default 25 s). |
| No Redis | Rate limits in Postgres (`RateLimitBucket`); in-process TTL caches. |
| No Docker | Plain Node.js app; no containers required anywhere. |
| No inbound WebSockets | No realtime features; future notifications use polling. |
| Limited, shared resources | Small DB pool (`DATABASE_POOL_MAX`, default 5) through Supabase's pooler; all heavy work in bounded jobs. |
| Ephemeral app disk on redeploy | No user files stored on disk; uploads go to object storage. |
| Hosting-specific paths | None. All configuration comes from environment variables. |

**Verify in hPanel before the first deploy (not verifiable from this repository):**
Node.js version (22.x recommended, ≥ 20.9 required by Next.js 16); build and start commands;
whether devDependencies are installed during the build (the build needs `prisma`, `tailwindcss` and
`typescript`); memory available to `next build`; the cron minimum interval; and whether the
`admin.` and `developers.` subdomains can point to the same Node.js app.

## 2. Supabase setup (owner actions)

1. Create a project in the region closest to the Hostinger datacentre (latency matters).
2. **Project Settings → Database → Connection string**:
   * Transaction pooler (port **6543**) → `DATABASE_URL` (runtime).
   * Session pooler (port **5432**) → `DIRECT_URL` (migrations and seeding). Use the session
     pooler rather than the direct host: direct connections are IPv6 unless the IPv4 add-on is
     purchased, and shared hosts are typically IPv4-only.
3. **Database → SSL**: download the CA certificate and store its PEM as `DATABASE_SSL_CA`.
   Set `DATABASE_SSL=verify-full`. Optionally enable "Enforce SSL".
4. **Data API (PostgREST)**: Webcenta never uses it. Either disable it (API settings) or leave
   it. Either way the baseline migration enables **RLS on every table** and **revokes all
   privileges** from the `anon` and `authenticated` roles (including default privileges for
   future tables). Never put Supabase `service_role` or `anon` keys in Webcenta's environment.
5. Run the compatibility check from a trusted machine (read-only):
   ```bash
   DATABASE_URL=... DIRECT_URL=... DATABASE_SSL=verify-full DATABASE_SSL_CA="$(cat prod-ca-2021.crt)" npm run db:check
   ```

## 3. Environment variables (Hostinger hPanel → Node.js app → Environment)

The annotated list is in [`.env.example`](../.env.example).

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV=production` | yes | |
| `DATABASE_URL` | yes | Supabase **transaction** pooler (port 6543) |
| `DIRECT_URL` | for migrations | Supabase **session** pooler (port 5432); used by `prisma migrate deploy`, `db:seed`, `admin:provision`, backups |
| `DATABASE_SSL=verify-full`, `DATABASE_SSL_CA` | yes | PEM from Supabase; literal `\n` allowed |
| `DATABASE_POOL_MAX` | no | default 5 |
| `PUBLIC_ORIGIN`, `ADMIN_ORIGIN`, `DEVELOPER_ORIGIN` | yes | `https://webcenta.com`, `https://admin.webcenta.com`, `https://developers.webcenta.com` |
| `USER_AUTH_SECRET`, `ADMIN_AUTH_SECRET` | yes | ≥ 32 random characters each; the app refuses to start without the user secret |
| `FIELD_ENCRYPTION_KEY` | yes | 32-byte base64; encrypts admin TOTP seeds; **never change after admins enrol** |
| `CRON_SECRET` | yes | ≥ 32 characters; the cron endpoint is disabled otherwise |
| `EMAIL_TRANSPORT=smtp`, `SMTP_*`, `EMAIL_FROM` | yes for real email | Hostinger mailbox SMTP works; `log` only records messages |
| `STORAGE_DRIVER=s3`, `S3_*`, `MEDIA_PUBLIC_BASE_URL` | yes for uploads | Hostinger's app disk is not durable across redeploys |
| `GOOGLE_CLIENT_ID/SECRET` | optional | Redirect URI `https://webcenta.com/api/auth/callback/google` |
| `APPLE_CLIENT_ID/SECRET` (+ `APPLE_APP_BUNDLE_IDENTIFIER`) | optional | Return URL `https://webcenta.com/api/auth/callback/apple`; needs the paid Apple Developer Program |
| `GOOGLE_WEB_RISK_API_KEY`, `URLHAUS_AUTH_KEY`, `VIRUSTOTAL_API_KEY` | recommended | Without at least one, every submission needs manual approval |
| `GEO_COUNTRY_HEADER`, `GEO_UNKNOWN_POLICY`, `TRUSTED_PROXY_HOPS` | yes | `cf-ipcountry` behind Cloudflare; `deny` hides geo-restricted listings when the country is unknown |
| `ADMIN_IP_ALLOWLIST` | optional | Comma-separated client IPs |
| `MAINTENANCE_MODE`, `MAINTENANCE_RETRY_AFTER` | no | `true` serves a 503 page with `Retry-After` (seconds, default 600) to all public requests; admin and cron keep working (§5a) |
| `SCANNER_ALLOW_PRIVATE_FOR_TESTS`, `ENABLE_TEST_ERROR_ROUTES` | **must be unset** | Test only (both are also ignored unless `PUBLIC_ORIGIN` is localhost) |

## 4. Deploy procedure (after the owner's approval)

1. **CI green** on the commit to deploy (`.github/workflows/ci.yml` runs the brand check, lint, typecheck,
   211 unit/DB tests, the restore drill, the build, the bundle secret scan and 112 E2E tests).
2. **Supabase** (§2), then from a trusted machine with `DIRECT_URL`:
   ```bash
   npm ci
   npx prisma migrate deploy
   npm run db:seed            # taxonomy, homepage sections, monitoring policy, plans, DRAFT legal templates
   npm run db:check           # all required checks must PASS
   ```
   **Never** pass `--fixtures` in production; the seed refuses without `ALLOW_DEV_FIXTURES=true`.
3. **First Super Administrator:**
   ```bash
   ADMIN_ORIGIN=https://admin.webcenta.com FIELD_ENCRYPTION_KEY=… npm run admin:provision -- --email you@yourcompany.com
   ```
   Open the printed single-use link (valid 72 hours), set a password and enrol TOTP. Invite other
   administrators from Admin → Administrators.
4. **Hostinger build settings:** Node 22.x; install `npm ci`; build `npm run build`; start `npm start`.
   Set all variables from §3 in hPanel.
5. **Domains & SSL:** attach `webcenta.com`, `www.`, `admin.` and `developers.` to the app with HTTPS
   (Hostinger SSL or Cloudflare). The app redirects `www` → apex and `developers.` → `/developer`, and
   serves the admin portal only on `admin.`. `api.webcenta.com` is optional: if attached, it serves
   `/api/*` only (public endpoints; no session cookies reach it) and redirects every other path to
   `webcenta.com`. The site itself always calls `webcenta.com/api`.
   Optionally upload `public/errors/*.html` as the host's or Cloudflare's custom error pages (§5a).
6. **Cron** (hPanel → Advanced → Cron Jobs), every 10 minutes:
   ```bash
   curl -fsS -m 60 -X POST -H "Authorization: Bearer <CRON_SECRET>" https://webcenta.com/api/cron/tick
   ```
   Check Admin → Jobs & email: "Last scheduler run" should be recent.
7. **Smoke test:** `/api/health` → `{"ok":true}`; register a test account (the email arrives); admin
   login with MFA; publish one real editorial listing and check its page, `/go/…`, sitemap and robots;
   check that `admin.` responses carry `x-robots-tag: noindex`.
8. **Backups:** schedule `scripts/backup.sh` (with `DIRECT_URL`) from a trusted machine or Supabase
   backups; run `scripts/restore-drill.sh` quarterly.
9. **Rollback:** redeploy the previous commit. Migrations are additive; restore from backup if data
   was damaged.

### Staging (recommended before production)
Use a second Supabase project (or schema) and a Hostinger subdomain (e.g. `staging.webcenta.com`)
with `SITE_BANNER="Staging"`, `EMAIL_TRANSPORT=log`, and a separate `CRON_SECRET`. Fictional
fixtures may be loaded there **only** with `ALLOW_DEV_FIXTURES=true`. No staging environment was
available to this build, so staging verification has **not** been performed.

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

Supabase provides daily backups on paid plans (point-in-time recovery is an add-on). Independently,
a scheduled `pg_dump` to separate storage plus a restore drill is planned for Phase 7.
**Not yet done.**

## 6. Migration path (no rewrite required)

| Target | What changes | What stays |
| --- | --- | --- |
| Hostinger VPS / DigitalOcean Droplet | Run `next start` under systemd or pm2 behind Caddy/Nginx; run `npm run jobs:tick` from system cron (or a loop); optionally self-host Postgres (`pg_dump`/`pg_restore` from Supabase); optionally add Redis and Meilisearch behind the existing interfaces; move the scanner to its own isolated host. | All application code, schema, migrations and env-var names. |
| Managed cloud (containers) | Add a Dockerfile at that time; horizontal scaling works because the web tier is stateless. | Same. |

Things deliberately avoided so this stays true: Supabase-specific SDKs, Auth, Storage or Realtime;
Vercel-only APIs; hosting-specific file paths; Edge-only runtime features.

## 7. Costs to approve before use

| Service | When | Cost note (check current pricing) |
| --- | --- | --- |
| Hostinger Business | Now | Already purchased |
| Supabase | Now | Free tier works for development. Production needs the Pro plan for backups, no pausing and higher limits. |
| Cloudflare (DNS/proxy) | Optional | Free plan provides the `CF-IPCountry` header and DDoS protection |
| Object storage (R2/B2) | Phase 2 | Low at small scale |
| Email provider | Phase 2 | Hostinger mailbox SMTP at first |
| Google Web Risk, VirusTotal | Phase 6 | Paid for commercial use |
| Apple Developer Program | Sign in with Apple | US$99/year |
