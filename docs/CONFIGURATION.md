# Webcenta — Configuration inventory

<!-- Generated from src/server/settings/env-inventory.json and registry.ts by `npm run config:docs`. Do not edit by hand. -->

Every environment variable the application reads, and every setting managed in **Admin → Settings**.

* **Startup** variables are read before the application can reach MySQL, so they live in the hosting
  environment (hPanel → Websites → Node.js → Environment variables) and need a restart or redeploy.
* **Dashboard** settings are stored in MySQL (secrets encrypted with AES-256-GCM) and apply within seconds.
  The environment variable with the same purpose is only a fallback while nothing is saved in the dashboard.

## Minimum hosting environment

| Variable | Why it cannot be a dashboard setting |
| --- | --- |
| `NODE_ENV` | "production" on the live server; enables production security checks. |
| `PUBLIC_ORIGIN` | Public address (https://webcenta.com). Admin and developer addresses default to its admin. and developers. subdomains. Needed to recognise each hostname before any setting can be read. |
| `DATABASE_URL` | MySQL / MariaDB connection. The application needs it before it can read any setting, so it cannot live in the database. |
| `FIELD_ENCRYPTION_KEY` | Root key: encrypts saved credentials and admin two-factor secrets and derives the session secret. Must exist before the database can be read; never stored in it. |

## Application and website

Dashboard: **General** (immediate), **Branding & SEO** (immediate), **Social profiles** (immediate), **Marketplace** (immediate).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `PUBLIC_ORIGIN` | Public address (https://webcenta.com). Admin and developer addresses default to its admin. and developers. subdomains. Needed to recognise each hostname before any setting can be read. | Required in production | No | Yes | No | Restart |
| `ADMIN_ORIGIN` | Only if the admin portal is not at admin.<public host>. | Optional | No | Yes | No | Restart |
| `DEVELOPER_ORIGIN` | Only if the developer portal is not at developers.<public host>. | Optional | No | Yes | No | Restart |
| `SITE_BANNER` | Fallback for the public banner text. | Optional | No | No | Yes — General (env is a fallback) | Immediate |

## Database

Dashboard: **Database** (redeploy).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | MySQL / MariaDB connection. The application needs it before it can read any setting, so it cannot live in the database. | Required | Yes | Yes | No | Restart |
| `DIRECT_URL` | Alternative URL for the Prisma CLI (e.g. Remote MySQL from a computer). | Optional | Yes | No | No | Restart |
| `DATABASE_SSL` | TLS mode for a remote database (disable | require | verify-full). | Optional | No | Yes | No | Restart |
| `DATABASE_SSL_CA` | CA certificate of a remote database. | Optional | No | Yes | No | Restart |
| `DATABASE_POOL_MAX` | Database connections per process (default 5). | Optional | No | Yes | No | Restart |

## Authentication and sessions

Dashboard: **Security & authentication** (immediate), **Microsoft sign-in** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `FIELD_ENCRYPTION_KEY` | Root key: encrypts saved credentials and admin two-factor secrets and derives the session secret. Must exist before the database can be read; never stored in it. | Required in production | Yes | Yes | No | Restart |
| `USER_AUTH_SECRET` | User session signing secret. Derived from FIELD_ENCRYPTION_KEY when unset. | Optional | Yes | Yes | No | Restart |
| `SETUP_TOKEN` | Opens first-time setup while no Super Administrator exists. Remove after setup. | Optional | Yes | No | No | Restart |
| `ADMIN_IP_ALLOWLIST` | Fallback admin-portal IP allow-list. | Optional | No | No | Yes — Security & authentication (env is a fallback) | Immediate |
| `TRUSTED_PROXY_HOPS` | Fallback number of trusted proxies for client IPs. | Optional | No | No | Yes — Security & authentication (env is a fallback) | Immediate |
| `GEO_COUNTRY_HEADER` | Fallback country header name. | Optional | No | No | Yes — Security & authentication (env is a fallback) | Immediate |
| `GEO_UNKNOWN_POLICY` | Fallback policy for unknown countries. | Optional | No | No | Yes — Security & authentication (env is a fallback) | Immediate |

## Google OAuth

Dashboard: **Google sign-in** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Fallback Google OAuth client ID. | Optional | No | No | Yes — Google sign-in (env is a fallback) | Immediate |
| `GOOGLE_CLIENT_SECRET` | Fallback Google OAuth client secret. | Optional | Yes | No | Yes — Google sign-in (env is a fallback) | Immediate |

## Apple OAuth

Dashboard: **Apple sign-in** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `APPLE_CLIENT_ID` | Fallback Apple Services ID. | Optional | No | No | Yes — Apple sign-in (env is a fallback) | Immediate |
| `APPLE_TEAM_ID` | Fallback Apple Team ID. | Optional | No | No | Yes — Apple sign-in (env is a fallback) | Immediate |
| `APPLE_KEY_ID` | Fallback Apple Sign in key ID. | Optional | No | No | Yes — Apple sign-in (env is a fallback) | Immediate |
| `APPLE_PRIVATE_KEY` | Fallback Apple Sign in private key (.p8 contents). | Optional | Yes | No | Yes — Apple sign-in (env is a fallback) | Immediate |
| `APPLE_CLIENT_SECRET` | Legacy: a pre-generated client-secret JWT (used only when no private key is configured). | Optional | Yes | No | Yes — Apple sign-in (env is a fallback) | Immediate |
| `APPLE_APP_BUNDLE_IDENTIFIER` | Fallback iOS bundle ID. | Optional | No | No | Yes — Apple sign-in (env is a fallback) | Immediate |

## GitHub OAuth

Dashboard: **GitHub sign-in** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `GITHUB_CLIENT_ID` | Fallback GitHub OAuth client ID. | Optional | No | No | Yes — GitHub sign-in (env is a fallback) | Immediate |
| `GITHUB_CLIENT_SECRET` | Fallback GitHub OAuth client secret. | Optional | Yes | No | Yes — GitHub sign-in (env is a fallback) | Immediate |

## Email and SMTP

Dashboard: **Email (SMTP)** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `EMAIL_TRANSPORT` | Fallback switch: "smtp" enables sending when nothing is saved in the dashboard. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `SMTP_HOST` | Fallback SMTP server. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `SMTP_PORT` | Fallback SMTP port. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `SMTP_SECURE` | Fallback SMTP TLS mode. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `SMTP_USER` | Fallback SMTP username. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `SMTP_PASSWORD` | Fallback SMTP password. | Optional | Yes | No | Yes — Email (SMTP) (env is a fallback) | Immediate |
| `EMAIL_FROM` | Fallback sender address. | Optional | No | No | Yes — Email (SMTP) (env is a fallback) | Immediate |

## Payments

Dashboard: **Stripe** (immediate, connection test), **PayPal** (immediate, connection test).

## Advertising

Dashboard: **Google AdSense** (immediate).

## Analytics

Dashboard: **Plausible Analytics** (immediate, connection test), **Google Analytics 4** (immediate).

## File storage

Dashboard: **Storage & uploads** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `STORAGE_DRIVER` | Fallback storage driver (local | s3). | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `STORAGE_LOCAL_DIR` | Fallback upload folder (absolute, outside the app in production). | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `S3_ENDPOINT` | Fallback S3 endpoint. | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `S3_REGION` | Fallback S3 region. | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `S3_BUCKET` | Fallback S3 bucket. | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `S3_ACCESS_KEY_ID` | Fallback S3 access key ID. | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `S3_SECRET_ACCESS_KEY` | Fallback S3 secret key. | Optional | Yes | No | Yes — Storage & uploads (env is a fallback) | Immediate |
| `MEDIA_PUBLIC_BASE_URL` | Fallback public media URL for a CDN-backed bucket. | Optional | No | No | Yes — Storage & uploads (env is a fallback) | Immediate |

## Security scanning

Dashboard: **Google Web Risk** (immediate, connection test), **abuse.ch URLhaus** (immediate, connection test), **VirusTotal** (immediate, connection test).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `GOOGLE_WEB_RISK_API_KEY` | Fallback Google Web Risk key. | Optional | Yes | No | Yes — Google Web Risk (env is a fallback) | Immediate |
| `URLHAUS_AUTH_KEY` | Fallback URLhaus Auth-Key. | Optional | Yes | No | Yes — abuse.ch URLhaus (env is a fallback) | Immediate |
| `VIRUSTOTAL_API_KEY` | Fallback VirusTotal key. | Optional | Yes | No | Yes — VirusTotal (env is a fallback) | Immediate |

## Notifications

Dashboard: **Notifications** (immediate).

## External APIs

Dashboard: **Search engines & IndexNow** (immediate, connection test).

## Developer services

Dashboard: **Developer portal** (immediate).

## Background jobs

Dashboard: **Scheduled tasks** (immediate).

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `CRON_SECRET` | Fallback cron secret. | Optional | Yes | No | Yes — Scheduled tasks (env is a fallback) | Immediate |
| `JOBS_TICK_BUDGET_MS` | Fallback time budget per cron run. | Optional | No | No | Yes — Scheduled tasks (env is a fallback) | Immediate |

## PWA

Dashboard: **PWA & app** (immediate).

## System and deployment

| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |
| --- | --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | "production" on the live server; enables production security checks. | Required in production | No | Yes | No | Restart |
| `MAINTENANCE_MODE` | "true" serves a maintenance page without touching the database (works even when the database is down, which is why it is not a dashboard setting). | Optional | No | Yes | No | Restart |
| `MAINTENANCE_RETRY_AFTER` | Retry-After seconds during maintenance. | Optional | No | Yes | No | Restart |
| `NEXT_BUILD_CPUS` | Build workers (default 2; Hostinger limits threads). | Optional | No | No | No | Redeploy |
| `WEBCENTA_ENV_SNAPSHOT` | "false" stops the build from copying these variables into the deployed app (see docs/DEPLOYMENT.md). | Optional | No | No | No | Redeploy |
| `ALLOW_DEV_FIXTURES` | Development only: allows fictional sample listings in the seed. | Must be unset in production | No | No | No | Restart |
| `SCANNER_ALLOW_PRIVATE_FOR_TESTS` | Tests only: lets the scanner reach local fixture sites. | Must be unset in production | No | No | No | Restart |
| `ENABLE_TEST_ERROR_ROUTES` | Tests only: routes that throw deliberately. | Must be unset in production | No | No | No | Restart |
