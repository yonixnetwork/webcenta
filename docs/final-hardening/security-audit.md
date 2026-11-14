# Security audit and hardening (November 2026)

An audit of the actual Webcenta code and its Hostinger deployment. No system is impossible to attack; this documents the defences in depth that exist, what this round added, and the risks that remain.

## 1. Administrator accounts

| Control | Status | Where |
|---|---|---|
| Separate admin identity (not user accounts), invitation only, no public sign-up | existing | `src/server/admin/*`, `AdminInvitation` |
| Mandatory TOTP MFA before any admin page or action; replay of a used time-step refused | existing | `adminVerifyMfa` |
| Password hashing: scrypt (N=2¹⁵, r=8, p=1, 64-byte key, per-user salt), constant-time compare; dummy hash for unknown emails (no timing-based enumeration) | existing | `src/server/admin/crypto.ts` |
| Account lockout: 5 failures (password or code) → 15 min lock; all sessions revoked on lock | existing | `auth.ts` |
| **Per-address limit across accounts** (password spraying): 20 attempts / 15 min | **new** | `adminLoginAction` |
| Sessions: random 256-bit token, only its SHA-256 stored; 8 h absolute, 30 min idle; revocable; revoked on role/status change | existing | `AdminSession` |
| Cookie: `__Host-wc_admin`, HttpOnly, Secure (https), SameSite=Strict, host-only on admin.webcenta.com (never sent to the public site or developers portal) | existing | `setCookie` |
| **Step-up re-authentication** (fresh authenticator code, valid 10 min on that session) for: inviting administrators, changing roles or status, revoking sessions, credential/payment/security settings, security policy and blocklist, removing or suspending listings, bulk reject/archive/suspend. Wrong codes count towards the lockout. | **new** | `src/server/admin/step-up.ts` |
| **New-device sign-in alert**: email to the administrator when a browser and network not seen in 90 days signs in | **new** | `alertIfNewDevice` |
| **Client address from trusted proxy hops only** (previously the first X-Forwarded-For entry, which a client can forge, was logged) | **fixed** | `reqMeta` |
| Role-based permissions checked on the server for every page and action; denials audited and now counted | existing + monitoring | `permissions.ts`, `assertAdmin` |
| Audit log of administrative actions (who, what, when, address) | existing | `AuditLog` |
| Optional admin IP allow-list | existing | Settings → Security |

## 2. Common web attacks

* **SQL injection.** All queries go through Prisma or tagged-template `$queryRaw`/`$executeRaw` (parameterised). The audit found **no** `$queryRawUnsafe`/`$executeRawUnsafe` and no string-built SQL.
* **XSS.** React escapes all output. The only `dangerouslySetInnerHTML` uses are:
  * JSON-LD (serialised with `<` escaped);
  * the policy renderer (`src/lib/markdown.ts`), which escapes everything first and emits only headings, lists, emphasis and https/relative links.

  Imported descriptions are plain text. The strict CSP (nonce + `strict-dynamic`, `object-src 'none'`, `base-uri 'self'`) limits the impact of any injection.
* **CSRF.**
  * Server actions: Next.js rejects cross-origin action requests (Origin/Host check; seen in the E2E logs as "Invalid Server Actions request").
  * Better Auth: checks the origin of auth requests ("Invalid origin").
  * Admin cookie: SameSite=Strict.
  * Beacons/APIs: validate the origin.
* **Access control / IDOR.**
  * Every user, developer and admin action resolves ownership on the server: favourites, collections, reviews, settings and notifications by user id; developer listings by organisation membership and role; admin by permission.
  * Covered by `security.spec.ts` ("broken access control").
* **Authentication attacks.**
  * Better Auth rate limits: sign-in 10 / 5 min, sign-up 10 / h, password reset 5 / h, verification email 5 / h.
  * Generic error messages.
  * Reset and verification tokens are single-use and expire.
  * OAuth account linking requires a verified local email and never trusts provider-asserted email blindly.
  * **New:** failed sign-ins and auth rate-limit hits are counted per address in the security log.
* **SSRF** (website import, scanner, domain verification).
  * `safeFetch` resolves DNS and blocks private, loopback, link-local, metadata and reserved ranges.
  * It re-checks every redirect hop and pins the resolved address (DNS-rebinding safe).
  * It applies timeouts and response-size caps.
  * Tested in `security.spec.ts` (metadata redirect) and `tests/unit/ssrf.test.ts`.
* **Uploads.**
  * Size limits per kind.
  * Decoded by sharp with a 40-megapixel cap.
  * Only JPEG/PNG/WebP/AVIF accepted, then **re-encoded to WebP** (strips scripts, metadata and polyglots).
  * Random UUID storage keys.
  * Served from `/media` with a strict content type and `nosniff`.
  * Executables rejected (E2E "malicious uploads").
* **Clickjacking.**
  * `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` everywhere.
  * The only exception is Webcenta's own sandboxed ad frames (`frame-ancestors 'self'`).
* **HTTP headers** (verified by E2E):
  * HSTS (1 year, includeSubDomains) in production;
  * CSP with a per-request nonce;
  * `nosniff`;
  * `Referrer-Policy: strict-origin-when-cross-origin`;
  * a Permissions-Policy denying camera, microphone, geolocation, payment, USB and (**new**) serial, HID, Bluetooth, motion sensors and display capture;
  * **new:** `Cross-Origin-Opener-Policy: same-origin`;
  * **new:** `X-Permitted-Cross-Domain-Policies: none`.

  The CSP still allows what OAuth (redirect-based), the PWA, analytics and ads need.

## 3. Bots and abuse

| Surface | Protection |
|---|---|
| Sign-in, sign-up, reset, verification | Better Auth limits (above) + security log |
| Admin sign-in | account lockout + per-address limit (new) |
| **Search page and suggestions** | **new:** 60 searches/min per address; **600/min for verified search-engine crawlers** (reverse DNS → forward DNS confirmation, Google/Bing/Apple/DuckDuckGo/Yandex). A user agent alone is never trusted, and no crawler is blocked from public pages. |
| Reviews, reports, contact form, uploads, domain checks, push subscription | existing per-user/per-address limits |
| **Admin imports and bulk actions** | **new:** 30 import requests / 10 min and 60 bulk actions / 10 min per administrator |
| Scheduler endpoint | secret (constant-time compare), refused calls now counted |
| Duplicate submissions | buttons disabled while pending; atomic claims for imports, checks and approvals |

CAPTCHA is not used: the existing limits, lockouts and monitoring cover the observed risks without adding friction for normal users. If sign-up abuse appears in the security log, a challenge on sign-up only (e.g. Cloudflare Turnstile, free) is the next step.

## 4. Monitoring and alerts (new)

* `SecurityEvent` table: one row per type, source and hour, so floods stay small. It records:
  * failed admin and user sign-ins;
  * lockouts;
  * new-device admin sign-ins;
  * failed confirmation codes;
  * permission denials;
  * rate-limit hits;
  * refused scheduler calls;
  * threat-intelligence matches on imports or submissions.

  No passwords, tokens, cookies or request bodies. Kept for 90 days.
* **Admin → Security → Account and request security**:
  * counts for the last 24 h, activity by type, recent warnings;
  * locked accounts;
  * active admin sessions, with "Revoke all their sessions";
  * configuration changes and sensitive admin actions.
* Scheduled job **security.alerts** (every 15 minutes) emails administrators once per event row when a threshold is reached:
  * any admin lockout, new-device sign-in or suspicious import;
  * 3 wrong confirmation codes;
  * 10 admin sign-in failures from one address;
  * 5 permission denials;
  * 10 refused scheduler calls;
  * 50 user sign-in failures from one address;
  * 20 rate-limit hits for one key.

## 5. Database

* **Credentials.** The application uses one MySQL user scoped to its own database. On Hostinger Business, MySQL users are per-database; remote access is off unless explicitly enabled. Keep it off, and use phpMyAdmin or a temporary remote grant for maintenance.
* **Connection.** 127.0.0.1 on the same server: no network exposure.
* **Secrets.**
  * `DATABASE_URL`, auth secrets and the encryption key exist only in hPanel environment variables and the build's `.env.production` (mode 0600, outside `public_html`).
  * Integration secrets saved in Admin → Settings are AES-256-GCM encrypted in the database.
  * Passwords are scrypt hashes.
  * Admin TOTP seeds are encrypted.
* **Logs.** The audit log, security log and push log never store passwords, tokens, cookies, push endpoints or keys. Settings audits record changed field names, not values (`settings.spec.ts`). IP addresses are stored for security purposes and purged (security events 90 days, history 180 days).
* **Backups and restore:** see [backup-restore.md](backup-restore.md).

## 6. Hostinger Business: what it provides, what it does not

From the hosting configuration seen through the Hostinger API and hPanel:

* **Provided:** a free SSL certificate and HTTPS redirect, server-level isolation between accounts, managed MySQL, scheduled backups (shown in hPanel → Files → Backups), and the Node.js app behind LiteSpeed.
* **Not provided as a configurable feature** (not exposed by the hosting API for this plan): a web application firewall with custom rules, bot management, advanced DDoS mitigation, or network-level rate limiting/geo-blocking. Webcenta therefore applies its protections at the application level (above).

**Recommendation (optional, not activated):** put webcenta.com behind **Cloudflare's free plan**. It adds:
* DDoS absorption;
* managed WAF rules (limited on the free tier);
* bot fight mode;
* edge rate-limiting rules;
* origin IP hiding.

It requires changing the domain's nameservers (a DNS change, so your decision). Afterwards set Admin → Settings → Security → trusted proxy hops so client addresses stay correct (`CF-Connecting-IP`). Paid tiers add better WAF and bot rules; none is needed to run safely today.

## 7. Remaining risks

* A stolen admin password **and** authenticator together grant access. This is mitigated by the new-device email, short sessions, step-up for the most damaging actions and revocation; hardware keys (WebAuthn) would remove this risk and are a possible future addition.
* Application-level rate limiting uses the database. A large distributed flood (DDoS) would reach the server before any limit applies; only an edge service (above) solves that.
* Third-party ad scripts run in sandboxed frames without access to the page, but their content is controlled by the ad network (block unsuitable categories in the Adsterra dashboard).
* Imports trust what websites say about themselves; every import still passes the security checks and moderation rules before publication.
