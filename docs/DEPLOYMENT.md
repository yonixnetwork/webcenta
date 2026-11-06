# WebCenter — Deployment

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

| Constraint | How WebCenter handles it |
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
4. **Data API (PostgREST)**: WebCenter never uses it. Either disable it (API settings) or leave
   it. Either way the baseline migration enables **RLS on every table** and **revokes all
   privileges** from the `anon` and `authenticated` roles (including default privileges for
   future tables). Never put Supabase `service_role` or `anon` keys in WebCenter's environment.
5. Run the compatibility check from a trusted machine (read-only):
   ```bash
   DATABASE_URL=... DIRECT_URL=... DATABASE_SSL=verify-full DATABASE_SSL_CA="$(cat prod-ca-2021.crt)" npm run db:check
   ```

## 3. Environment variables (Hostinger hPanel → Node.js app → Environment)

See [`.env.example`](../.env.example) for the full annotated list. Production minimum:

```
NODE_ENV=production
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DATABASE_SSL=verify-full
DATABASE_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
PUBLIC_ORIGIN=https://webcenter.com
ADMIN_ORIGIN=https://admin.webcenter.com
DEVELOPER_ORIGIN=https://developers.webcenter.com
CRON_SECRET=<openssl rand -hex 32>
TRUSTED_PROXY_HOPS=1
GEO_COUNTRY_HEADER=cf-ipcountry   # only meaningful behind Cloudflare
GEO_UNKNOWN_POLICY=deny
```

`DATABASE_SSL_CA` may be given with literal `\n` sequences; they are converted to newlines.

## 4. Deploy procedure (after approval)

1. **CI green** on the commit to be deployed (`.github/workflows/ci.yml`).
2. **Migrate** Supabase from a trusted machine, using `DIRECT_URL`:
   ```bash
   npm ci
   npx prisma migrate deploy
   npm run db:seed          # taxonomy, homepage sections, monitoring policy, safe to repeat
   npm run db:check
   ```
   Migrations are **not** run during the Hostinger build. This avoids partial migrations on
   build retries and keeps database credentials with migration rights off the build pipeline.
   A manual-approval GitHub Actions workflow can take over this step later.
   **Never** run `db:seed -- --fixtures` against production; the script refuses unless
   `ALLOW_DEV_FIXTURES=true` and `NODE_ENV` is not `production`.
3. **Hostinger build settings:** install `npm ci`, build `npm run build` (runs `prisma generate`),
   start `npm start`.
4. **Domains:** attach `webcenter.com`, `www.webcenter.com`, `admin.webcenter.com` and
   `developers.webcenter.com` to the same app, with HTTPS on all. The app handles the `www` → apex
   308 redirect and host-based routing itself.
5. **Cron:** in hPanel → Advanced → Cron Jobs, every 10 minutes:
   ```bash
   curl -fsS -m 60 -X POST -H "Authorization: Bearer <CRON_SECRET>" https://webcenter.com/api/cron/tick
   ```
6. **Smoke test:** `/api/health` returns `{"ok":true}`; the homepage, a category and the
   `admin.` host (should be `noindex`) load; `/sitemap.xml` and `/robots.txt` are served.
7. **Rollback:** redeploy the previous commit from Hostinger. Migrations are additive by policy.
   A destructive migration needs a written rollback plan and a fresh backup first.

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
