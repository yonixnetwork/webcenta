# Webcenta — Admin configuration system

Admin → **Settings** (`https://admin.webcenta.com/settings`) configures integrations and site
behaviour without code edits and, for every section, without a restart or redeploy.

## 1. How it works

| Part | File | What it does |
| --- | --- | --- |
| Registry | `src/server/settings/registry.ts` | Declares every section and field: type, validation, environment fallback, who may edit, when changes apply, where to get credentials, and which code uses it. The UI, validation and status are all generated from it. |
| Store | `src/server/settings/store.ts` | One `SystemSetting` row per section (`config.<id>`). Values resolve as **saved value → environment variable → default**. Each process caches the rows and re-checks one version row (`config.__version`) at most every 5 s, so a change reaches every worker within seconds. If the database is unreachable it falls back to env/defaults instead of failing. |
| Encryption | `src/server/settings/keys.ts` | Secret fields are sealed with AES-256-GCM. The key is derived (HKDF-SHA256) from `FIELD_ENCRYPTION_KEY`, and the associated data is the section and field (`config.email.password`), so a ciphertext cannot be moved to another field. Secrets are decrypted only on the server. |
| Tests | `src/server/settings/testers.ts` | Real connection tests (see §3). They report only what the provider answered; secrets are scrubbed from every message. A result counts only while the configuration it was run with is unchanged. |
| UI and actions | `src/app/admin-host/(portal)/settings/`, `src/server/actions/settings.ts` | Index with a status per section (Disabled / Missing settings / Configured / Connected / Error), section pages with Enable switch, Save and Test connection. |

### Secrets
* Password-type inputs that are always empty. A saved secret shows only a mask (`••••••••`; long API
  keys also show their last 4 characters, passwords never do). An empty field keeps the saved value;
  **Remove the saved value** deletes it.
* Secrets never reach the browser, logs, analytics or the audit log. `settings.update` audit entries
  list the changed field **names** only (e.g. `password (replaced)`); `settings.test` records ok/failed.
* Losing or changing `FIELD_ENCRYPTION_KEY` makes saved secrets unreadable: the section shows
  **Error — the encryption key changed** and they must be entered again.

### Permissions
* `settings.manage` (Super Administrator, Administrator): view all sections; edit website, SEO,
  PWA, social, marketplace, developer portal, notifications, analytics and webmaster sections.
* `integrations.manage` (**Super Administrator only**): every section holding credentials or
  security options (email, sign-in providers, security, storage, scanners, payments, scheduled tasks)
  and applying database migrations. Administrators see these read-only.

## 2. What is configurable here, and who uses it

| Section | Used by | Applies |
| --- | --- | --- |
| General (name, description, contact, banner) | Titles, Open Graph, footer, public banner | immediately |
| Branding & SEO (title, indexing, OG image, X handle) | Metadata, `robots.txt`, `X-Robots-Tag` | immediately |
| PWA & app | `/manifest.webmanifest` | immediately (installed apps refresh within ~a day) |
| Social profiles | Footer links, Organization JSON-LD `sameAs` | immediately |
| Database | Status only: version, size, migrations, **Apply pending migrations** | `DATABASE_URL` change needs a redeploy |
| Marketplace (page size, "highly rated" thresholds) | Search, categories, homepage rail, alternatives | immediately |
| Developer portal (new orgs, draft limit, verification methods) | Org creation, submissions, domain verification | immediately |
| Scheduled tasks (cron secret, time budget) + queue health | `POST /api/cron/tick`, job runner | immediately (update the hPanel cron command when the secret changes) |
| Email (SMTP) | Every email; disabled = recorded in Jobs & email, not sent | immediately |
| Notifications (alert recipients, email toggles) | Admin alerts, user notification emails | immediately |
| Security & authentication (sign-ups, session length, admin IP allow-list, proxy hops, country header, unknown-country policy) | Sign-up, sessions, admin portal (proxy), rate limits, analytics, geo restrictions | immediately (new session length applies to new sessions) |
| Google / Apple / GitHub / Microsoft sign-in | Sign-in, sign-up, account linking | immediately |
| Storage & uploads (hosting disk or S3-compatible) | Uploads, `/media/*`, private documents | immediately (existing files are not moved) |
| Google Web Risk, URLhaus, VirusTotal | Submission checks, monitoring; auto-approval needs at least one | immediately |
| Plausible, Google Analytics 4, Google AdSense | Scripts on public pages (never admin), CSP sources, `/ads.txt` | immediately |
| Stripe, PayPal | Stored and verified only: **billing is not active** | — |
| Search engines & IndexNow | Verification meta tags, `/indexnow-key.txt`, IndexNow ping on publish | immediately |
| Ranking, announcements & legal | `/settings/content` (existing tools) | immediately |

Nothing in the dashboard needs a restart. Only the startup variables below need a restart or redeploy.

## 2a. Sign-in providers (Google, Apple, GitHub)

Settings → **Google OAuth**, **Apple OAuth**, **GitHub OAuth** (Super Administrators). Each page shows the
exact callback URLs to register, for the marketplace and for the developer portal:

| Provider | Register | Fields |
| --- | --- | --- |
| Google | OAuth client (Web): redirect URIs `https://webcenta.com/api/auth/callback/google` and `https://developers.webcenta.com/api/auth/callback/google` | Client ID, Client secret |
| Apple | Services ID: domains `webcenta.com`, `developers.webcenta.com`; return URLs `…/api/auth/callback/apple` on both; a Sign in with Apple key | Services ID, Team ID, Key ID, private key (.p8). Webcenta signs the client secret (ES256) itself and renews it daily, so it never expires. A pre-generated JWT is accepted as a legacy alternative. |
| GitHub | OAuth App with callback `https://webcenta.com/api/auth/callback/github`; a GitHub OAuth App has only one callback URL, so a **second** OAuth App with `https://developers.webcenta.com/api/auth/callback/github` enables GitHub on the developer portal | Client ID, Client secret; optional developer-portal Client ID and secret |

A provider's button appears only when it is **enabled and complete**. "Test connection" sends the provider
a deliberately invalid authorisation code: the provider answers `invalid_grant` only for a valid client and
`invalid_client` otherwise, so the test checks the credentials without signing anyone in. It cannot prove
that the callback URL is registered: do one real sign-in per provider after configuring it.

Security of the flows (Better Auth): `state` and PKCE on every authorisation request (CSRF); Google and Apple
ID tokens verified against the providers' published keys; server-side code exchange; callback URLs fixed to each site's
own origin, trusted origins limited to that site (cross-site sign-in requests are refused), host-only
`HttpOnly`/`Secure`/`SameSite=Lax` session cookies, sessions revoked on sign-out.

**Account linking.** A social sign-in joins an existing account only when the provider reports the email
as verified **and** the existing Webcenta account's email has been verified. No provider is trusted
blindly, so an unverified address can never be used to take over or pre-register someone else's account.
Otherwise the sign-in is refused with an explanation; the user can sign in with their password and link
the provider from Account → Sign-in methods. Emails are unique, so duplicate accounts cannot be created.

Administrators never use social sign-in: the admin portal keeps password + mandatory TOTP.

## 3. Connection tests

| Section | Test |
| --- | --- |
| Email | SMTP connect + login, then sends a test email to the admin running the test |
| Google, GitHub, Microsoft, Apple | Exchanges a deliberately invalid authorization code. The provider answers "invalid grant" only after accepting the client ID and secret, and "invalid client" when they are wrong. Apple also checks the JWT claims and expiry. A full check still needs a real sign-in (redirect URI). |
| Storage | Writes, reads back and deletes a test file |
| Web Risk / URLhaus / VirusTotal | Authenticated lookup / quota request |
| Plausible | Script URL responds with JavaScript |
| Stripe | `GET /v1/balance` (no charge); publishable/secret key modes must match |
| PayPal | OAuth client-credentials token (no payment) |
| Search engines & IndexNow | The site serves the key file |
| GA4, AdSense | No API test is possible without additional OAuth access; status is Configured |

## 3a. Categories and the configuration inventory

Settings are organised in 18 categories: application and website, database, authentication and sessions,
Google OAuth, Apple OAuth, GitHub OAuth, email and SMTP, payments, advertising, analytics, file storage,
security scanning, notifications, external APIs, developer services, background jobs, PWA, system and
deployment. **Settings → Configuration inventory** lists every environment variable the application reads,
with purpose, required or optional, secret or not, startup or dashboard-managed, what a change needs,
and whether it is set (never its value). The same list is in [CONFIGURATION.md](CONFIGURATION.md),
generated from `src/server/settings/env-inventory.json`; a test fails if code reads a variable that is not
in the inventory.

## 4. Hosting environment (startup values)

Set in hPanel → Websites → Node.js → Environment variables. They cannot be edited from the
dashboard because the application needs them before it can read any setting.

| Variable | Required |
| --- | --- |
| `DATABASE_URL` | always |
| `FIELD_ENCRYPTION_KEY` | production |
| `PUBLIC_ORIGIN` | production |
| `NODE_ENV=production` | production |
| `SETUP_TOKEN` | first deploy only |

Optional: `ADMIN_ORIGIN`/`DEVELOPER_ORIGIN` (default `admin.`/`developers.` subdomains of
`PUBLIC_ORIGIN`), `USER_AUTH_SECRET` (default: derived from `FIELD_ENCRYPTION_KEY`),
`DATABASE_POOL_MAX`, `MAINTENANCE_MODE`. The older integration variables still work as fallbacks
(see `.env.example` §4). The dashboard never writes to the hosting environment.

## 5. First-time setup

1. Set the startup variables plus `SETUP_TOKEN` (≥ 32 chars) and deploy.
2. Open `https://admin.webcenta.com/setup`. The page exists only while `SETUP_TOKEN` is set **and**
   no active Super Administrator exists; otherwise it answers 404. Every action needs the token
   (constant-time comparison, rate-limited, rejected attempts audited).
3. **Create tables and base data**: applies pending migrations (compatible with
   `prisma migrate deploy`: same `_prisma_migrations` table and checksums, serialised with a
   database lock) and the idempotent base seed.
4. **Create owner invitation**: a single-use link (72 h) to set a password and enrol TOTP.
5. Sign in → Settings → configure and test Email first, then the other integrations.
6. Remove `SETUP_TOKEN` (the Settings page reminds you while it is still set).

## 6. External credentials you must obtain

| Integration | Where | Cost |
| --- | --- | --- |
| SMTP | hPanel → Emails (mailbox password) | included while the email plan is active |
| Google sign-in | Google Cloud Console → Credentials (redirect `https://webcenta.com/api/auth/callback/google`) | free |
| Apple sign-in | Apple Developer → Services ID + key; JWT secret, rotate ≤ 6 months (`…/callback/apple`) | US$99/year |
| GitHub sign-in | GitHub → Developer settings → OAuth Apps (`…/callback/github`) | free |
| Microsoft sign-in | Entra admin center → App registrations (`…/callback/microsoft`) | free |
| S3 storage (optional) | Cloudflare R2 / Backblaze B2 / AWS | paid by usage |
| Web Risk / URLhaus / VirusTotal | Google Cloud / abuse.ch / VirusTotal | commercial terms / free / paid licence for commercial use |
| Plausible, GA4, AdSense | Their dashboards | Plausible paid; GA4/AdSense need a consent banner in the EU/UK first |
| Stripe, PayPal | Dashboards | Not used until billing is built |

## 7. Limitations (stated honestly)

* GA4 and AdSense set cookies; Webcenta has no consent banner yet. Do not enable them for EU/UK
  visitors until one exists and the privacy policy is updated.
* Payments: keys can be stored and verified, but no checkout exists.
* OAuth tests cannot prove the redirect URI is registered; do one real sign-in after configuring.
* The proxy reads settings with a 1.5 s limit. If the database is slower, that request uses the
  last loaded or environment values (a strict CSP; analytics may not load for that page view).
