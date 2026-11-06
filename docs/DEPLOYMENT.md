# WebCenter — Deployment Strategy

## 1. Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| Local | Development | Local Postgres; `prisma/seed` DEV fixtures clearly marked as fictional |
| CI | GitHub Actions | Ephemeral Postgres service container |
| Staging | Pre-release checks (`staging.webcenter.com`, `noindex`, basic-auth protected) | Separate database; synthetic data only |
| Production | `webcenter.com` and subdomains | Real data only; **no fixtures** |

The seed script refuses to load development fixtures when `NODE_ENV=production`. Taxonomy
categories, which are real configuration rather than fake data, can be seeded in production.

## 2. Stage 1 — Hostinger managed Node.js hosting

Assumptions to **verify against the purchased plan before launch**: Node.js 20/22 is supported,
deployment works from GitHub, environment variables can be set in hPanel, cron jobs are
available, and there is a writable disk. MySQL is offered locally. **PostgreSQL is not**, so the
database is a managed Postgres in the same region (see ADR-0002).

```
GitHub (main) ──► Hostinger Node.js app (Next.js `next start`)
                     ├── env vars set in hPanel (never in the repo)
                     ├── cron (every 5–15 min): `npm run jobs:tick`   (or HTTPS POST /api/cron/tick with CRON_SECRET)
                     └── connects to → Managed PostgreSQL (TLS), S3-compatible bucket, SMTP
```

Deploy steps (scripted in `package.json`):
1. `npm ci`
2. `npm run db:migrate:deploy` (uses the migration role's connection string)
3. `npm run build`
4. Restart the app.

Constraints respected:
* **No permanent worker.** All background work is a bounded `jobs:tick` run, so overlapping runs
  are safe thanks to `SKIP LOCKED`.
* **No Redis or Docker.** Caching is in-process plus Next.js caching; rate limits live in Postgres.
* **No inbound WebSockets.** Notifications use polling or server-sent fetches on navigation.
* **No hard-coded paths or hosts.** Everything comes from env (`PUBLIC_ORIGIN`, `STORAGE_*`, …).
* Uploaded files go to object storage, not the app disk, so redeploys never lose them.

DNS: `webcenter.com`, `www`, `admin`, `developers` (and optionally `api`) all point to the app.
`www` redirects to the apex in middleware. TLS certificates come from the hosting panel or
Cloudflare. Cloudflare as a DNS/CDN proxy is recommended: it provides a `CF-IPCountry` header for
geo context, absorbs DDoS traffic, and gives cached static assets.

## 3. Stage 2 — VPS (Hostinger VPS, DigitalOcean, Hetzner, …)

The code needs no rewrite. Operational changes:
* Run Next.js with systemd or pm2 behind Caddy or Nginx (automatic TLS).
* Run `jobs:work` as a long-lived worker instead of cron ticks.
* Optionally move Postgres onto the VPS or keep it managed (managed is recommended for backups and
  PITR).
* Add Redis/Valkey for the shared cache and rate limits, and Meilisearch for search, each behind
  its existing interface.
* Move the **scanner to its own VPS or container**, with egress-only firewall rules and no route
  to the database.
* Optionally run the admin portal as a separate process (`APP_SURFACE=admin`) behind an IP
  allow-list.

## 4. Stage 3 — Cloud / containers
Containerise (Dockerfile added at this stage), use managed Postgres with read replicas, put a CDN
in front of object storage, scale the web tier horizontally (stateless thanks to the DB and
Redis), and use a queue service if job volume demands it.

## 5. Costs and paid services (to approve before use)

| Service | Needed for | Cost note |
| --- | --- | --- |
| Hostinger Node.js plan | App hosting | Already planned |
| Managed PostgreSQL (Neon, Supabase, DigitalOcean, Aiven…) | Database | Free tiers exist; production plans typically ~US$15–30/month |
| Cloudflare R2 / Backblaze B2 | Images and documents | Low cost at small scale; R2 has no egress fees |
| SMTP (Hostinger mailbox), later Postmark/SES/Resend | Transactional email | Mailbox included; dedicated providers are cheap at low volume |
| Google Web Risk API | Malicious URL checks (commercial use) | Paid per lookup beyond the free quota |
| VirusTotal | Optional extra intel | Public API is **not** for commercial use; premium licence is paid |
| abuse.ch URLhaus | Malware URL intel | Free (auth key required) |
| Sentry | Error monitoring | Free tier available |
| Apple Developer Program | "Sign in with Apple" | US$99/year |

Exact prices change. Confirm them with each provider at purchase time.

## 6. Release checklist (every phase)
1. Typecheck, lint, unit and integration tests, plus E2E for affected flows.
2. Schema validate; migration reviewed for data loss.
3. Security review of changed auth, permissions, upload, scanner or redirect code.
4. Docs and ROADMAP status updated.
5. Commit, push, and record results in the phase report.
