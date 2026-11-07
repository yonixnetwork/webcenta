# Webcenta — Security Design

Status: **implemented**. Evidence and remaining risks are in [FINAL_REPORT.md](FINAL_REPORT.md) §4.
Implementation status per feature is in [ROADMAP.md](ROADMAP.md). Webcenta never claims complete
security, legal compliance or that a listed website is "guaranteed safe".

## 1. Assets and threats

| Asset | Main threats |
| --- | --- |
| Admin portal and accounts | Credential stuffing, phishing, session theft, privilege escalation, insider misuse |
| Listing integrity | Malicious or phishing sites submitted, bait-and-switch after approval, impersonation, fake reviews |
| Scanner infrastructure | SSRF into internal networks or cloud metadata, DNS rebinding, resource exhaustion, malicious downloads |
| User data | Account takeover, data leakage to developers, over-collection |
| Outbound links | Open redirect, tab-nabbing, linking to sites that turned malicious |
| Platform | XSS via user content, CSRF, injection, upload abuse, scraping, DoS |

## 2. Identity and access

### 2.1 Public users and developers
* Better Auth with email+password (scrypt hashing), email verification required before posting
  reviews or submitting listings, and password reset tokens that are single-use and short-lived.
* OAuth via Google and Apple, enabled only when credentials are configured.
* Session cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, with the `__Secure-` prefix.
* Rate limits on sign-in, sign-up, reset and verification endpoints. Failed logins are written to
  `AuthEvent`.
* Developer permissions come from `DeveloperMember.role` within an organisation. Every developer
  action checks membership server-side.

### 2.2 Administrators (fully isolated)
* Separate tables (`AdminUser`, `AdminSession`) and a separate cookie scoped **host-only** to
  `admin.webcenta.com` (`__Host-wc_admin`, `SameSite=Strict`). A public user session can never
  authorise admin access, and an admin session is not sent to the public site.
* **No public registration.** The first Super Administrator is created by a server-side CLI
  (`npm run admin:provision`) run from the hosting shell. Everyone else joins by `AdminInvitation`:
  a single-use hashed token that expires within 72 hours, is bound to an email address, and comes
  with its role.
* **MFA mandatory.** TOTP is required before any admin route works; the seed is encrypted with
  AES-256-GCM. WebAuthn/passkeys are a planned upgrade.
* Lockout after repeated failures (`failedLoginCount`, `lockedUntil`). Every attempt is logged in
  `AdminLoginEvent`.
* Session lifetime: 8 h absolute and 30 min idle. Role changes or suspension revoke all sessions.
* Optional IP allow-list for `admin.` (an env var). Recommended once on a VPS or behind Cloudflare.
* `X-Robots-Tag: noindex` on all admin responses, and the admin host is not linked from public
  pages.

### 2.3 Role-based access control

Permissions are defined in code (one reviewed file). The role is stored on `AdminUser`.

| Permission | Super Admin | Admin | Moderator | Support | Analytics |
| --- | :-: | :-: | :-: | :-: | :-: |
| Manage admins and roles | ✔ | | | | |
| System settings, ranking weights, legal policies | ✔ | ✔ | | | |
| Categories, homepage, placements | ✔ | ✔ | | | |
| Approve, reject, suspend or remove listings | ✔ | ✔ | ✔ | | |
| Moderate reviews, resolve reports, decide appeals | ✔ | ✔ | ✔ | | |
| Verify developers, decide claims and compliance docs | ✔ | ✔ | ✔ (no business verification) | | |
| Suspend user accounts | ✔ | ✔ | ✔ | | |
| Support cases, view user account status | ✔ | ✔ | ✔ | ✔ | |
| Platform analytics (aggregates) | ✔ | ✔ | ✔ | | ✔ |
| View audit log | ✔ | ✔ (read) | | | |

Rules:
* Nobody can grant a role higher than their own.
* The last active Super Admin cannot be demoted or suspended.
* Every permission check runs server-side inside the service function, not only in the UI.

### 2.4 Audit
Every important action writes `AuditLog` (actor, action, target, before/after diff, IP, user
agent), including approvals, rejections, edits to listings, role changes, setting changes, logins
and exports. In production the app's database role cannot `UPDATE` or `DELETE` audit rows.

## 3. Scanner safety (SSRF and resource protection)

All outbound fetches of **submitted URLs** go through one module, `src/server/scanner/safeFetch`.
Nothing else in the app may fetch user-supplied URLs.

1. **URL validation:** only `https:` and `http:`, and only ports 80 and 443. Credentials in URLs
   are rejected. IDN domains are converted to punycode and recorded for impersonation checks.
2. **DNS resolution performed by us, then pinned.** All A/AAAA records are resolved. The request
   is rejected if *any* address is in a blocked range. The connection is then made to the
   validated IP, with the original Host/SNI, so a second DNS lookup can't change the target. This
   defeats DNS rebinding.
3. **Blocked ranges:** loopback (`127.0.0.0/8`, `::1`), RFC1918, CGNAT `100.64.0.0/10`, link-local
   `169.254.0.0/16` (cloud metadata `169.254.169.254`) and `fe80::/10`, ULA `fc00::/7`,
   `0.0.0.0/8`, multicast, broadcast, documentation/benchmark ranges, IPv4-mapped IPv6 forms of
   all of these, and NAT64 prefixes. Internal hostnames such as `metadata.google.internal` and
   `*.internal` are also blocked.
4. **Redirects followed manually** (max 5). Every hop is re-validated with steps 1–3, and the full
   chain is recorded in `SecurityScan.redirectChain`.
5. **Limits:** 5 s connect timeout, 15 s total, 2 MB maximum body (streamed, then aborted), only
   `text/html` bodies are parsed, at most 3 concurrent fetches per runner, and a per-domain rate
   limit.
6. **No code execution:** pages are never rendered with JavaScript in the main app. Download
   behaviour is detected from headers (`Content-Disposition`, executable MIME types) and **not**
   saved. File hashes are sent to threat-intel APIs when available.
7. **Isolation roadmap:** on shared hosting the scanner runs in the app process with the guards
   above. Before scaling, or before adding headless-browser rendering, it moves to a dedicated
   VPS or container that has only outbound internet access and no route to the database or
   internal networks, and that reports results through an authenticated API. This is required,
   not optional, for any browser-based scanning.

## 4. Listing security pipeline

### 4.1 Submission checks (`ScanTrigger.SUBMISSION`)

| Check | Source |
| --- | --- |
| Domain ownership | `DomainVerification` (DNS TXT, meta tag or `/.well-known/webcenta-verification.txt`) |
| DNS resolution, HTTPS reachability, TLS validity and expiry, HSTS | Internal |
| Redirect chain (off-domain hops, URL shorteners, too many hops) | Internal |
| Known malicious URL or domain | Google **Web Risk** (commercial terms; the Safe Browsing v4 API is non-commercial only), abuse.ch **URLhaus**, optionally **VirusTotal** (commercial use needs a paid licence) |
| Phishing indicators | Internal heuristics: password forms on fresh domains, brand keywords in non-matching domains, lookalike/homoglyph domains (edit distance against listed brands), suspicious TLDs |
| Impersonation | Domain similarity to existing listings and known brands; publisher name vs domain |
| Policy pages present | Privacy policy and terms URLs resolve |
| Category risk | `Category.riskTier`, `requiresManualReview`, `requiresComplianceDocs` |

**Inconclusive is never PASS.** A provider timeout makes the check `INCONCLUSIVE`, which sends the
submission to manual review.

### 4.2 Risk-based approval engine
Auto-approval is allowed only when **all** of these hold:
* `MonitoringPolicy.allowAutoApproval = true` for the listing's tier (default: LOW only);
* the category does not require manual review or compliance documents;
* the domain is verified, or this is an editorial listing created by an admin;
* every required check is `PASS` (no `WARN`, `FAIL` or `INCONCLUSIVE`);
* the developer organisation is active, at least N days old, and has no open moderation issues.

Everything else goes to `UNDER_REVIEW`. HIGH-tier categories (crypto exchanges and investing,
forex, trading bots and signals, betting and gambling, prediction markets, lending, medical,
adult, services handling children's or sensitive data) **always** require manual approval plus
compliance evidence: licence or registration, operator identity, jurisdiction, risk disclosures
and age gating. A disclaimer does not make an unlicensed service acceptable.

**Prohibited** (rejected, never listed): phishing, malware, ransomware, stolen accounts and data,
impersonation, fraudulent investment schemes, illegal marketplaces, and child sexual abuse
material. CSAM is reported to the relevant authorities as legally required.

### 4.3 Continuous monitoring
* A `monitor.enqueue` job runs each cron tick and enqueues `scan.listing` for listings with
  `nextScanAt ≤ now`.
* Default intervals (`MonitoringPolicy`, admin-editable): LOW 7 days, MEDIUM 3 days, HIGH 24 h.
  Recently reported listings are also re-scanned.
* Change detection compares each scan with the previous one: final domain, resolved IPs and
  nameservers, TLS issuer and fingerprint, page title, `contentHash` (normalised text), new
  redirects, availability, and threat-intel hits.
* Domain-verification proof is re-checked periodically. When it disappears the status becomes
  `LAPSED` and an alert is raised.

### 4.4 Response
* Each finding raises a `SecurityAlert` with a severity.
* At or above `autoRestrictAtSeverity` (default CRITICAL: a confirmed threat-intel hit):
  `securityStatus = RESTRICTED`. The listing is hidden from discovery and `/go/` shows a warning
  instead of redirecting. A `ModerationAction` is written with `actorType = SYSTEM`, and admins
  are notified.
* Lower severities set `WARNING` or `UNDER_INVESTIGATION` and go to the moderation queue.
* An admin investigates and restores, suspends or removes the listing. Every step is audited and
  the developer is notified.
* Public wording: "Last checked {date}: no issues detected by our automated checks." Never "safe"
  or "secure".

## 5. Application security controls

| Area | Control |
| --- | --- |
| XSS | React escaping; user Markdown rendered with a strict sanitiser (no raw HTML); strict CSP with nonces; no third-party scripts on listing pages. |
| CSRF | Server actions with origin checks; `SameSite` cookies; double-submit token on non-action POST handlers. |
| Injection | Prisma parameterised queries; raw SQL only through tagged templates. |
| Open redirect | `/go/[slug]` resolves the destination from the DB only; internal `linkPath` values must start with `/`. |
| Tab-nabbing | `rel="noopener noreferrer"` on all external links. |
| Uploads | Size limits; MIME detected from magic bytes; images re-encoded with sharp (strips EXIF and payloads); SVG rejected for user uploads; random storage keys; compliance documents in a private bucket behind signed short-lived URLs. |
| Headers | HSTS (preload after launch), CSP, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`. |
| Secrets | Environment variables only; `.env*` git-ignored; GitHub secret scanning and push protection enabled; keys rotated on staff changes. |
| Dependencies | Lockfile committed; `npm audit` and Dependabot in CI. |
| Abuse | Rate limits on reviews, reports, sign-ups, search and `/go`; review spam heuristics (account younger than 24 h, links in the text, a burst of reviews, text duplicated from another user); held reviews go to moderation. One review per user per listing (database unique constraint); a second submission edits the first. |
| Logging | Structured logs without secrets, tokens or full IPs in application logs. |

## 6. Privacy

* Browsing works without an account. Tracking is first-party only, with no third-party ad
  trackers.
* Anonymous analytics use an HMAC visitor hash with a **daily-rotated secret** that is then
  discarded. Uniques are per day, and nothing links across days. Country comes from a CDN header
  or IP lookup; the IP itself is not stored in events.
* Personalisation signals (`InteractionEvent`) are kept only for signed-in users with
  `historyEnabled`. Users can disable personalisation, clear history, reset interests and export
  or delete their data.
* Developers only ever see aggregates, with small-count suppression (buckets under 5 are shown as
  "<5"). They never see individual users' browsing.
* Outbound-click counts are labelled as clicks, not conversions.
* A cookie and consent banner is required only for non-essential storage. Legal review is needed
  for GDPR, UK GDPR, CCPA/CPRA and other applicable laws before launch.

## 7. Age and geography
* Age ratings are shown on every listing. 18+ categories are hidden by default and need an
  explicit opt-in with a self-declared age confirmation. This is **not** age verification;
  jurisdictions that legally require verification need a third-party provider and legal review
  before enabling those categories there.
* Country restrictions are best-effort, based on IP and user preference. VPNs can bypass them,
  and Webcenta must not claim perfect geo-enforcement. Restricted categories stay
  `isRestricted = true` until legal review enables them for specific markets.

## 8. Incident response (outline)
1. Detect: an alert, a report, or a monitoring anomaly.
2. Contain: restrict the listing, revoke sessions, rotate keys.
3. Investigate, using the audit log and scan evidence.
4. Notify affected users or authorities where legally required.
5. Write a post-mortem in `docs/operations/incidents/`.

## 9. As-built notes (differences from the original design)

* **Developer portal** is served at `webcenta.com/developer`; `developers.webcenta.com` redirects there.
  Developer and user sessions therefore share one **host-only** cookie (no cross-subdomain cookie).
* **Admin sessions** use a custom layer (scrypt passwords, SHA-256-hashed session tokens, AES-256-GCM
  encrypted TOTP seeds, TOTP replay protection), not the user auth library.
* **Admin forms** perform full-page navigations after redirects so the host rewrite always applies.
* **The outbound interstitial** (`/go/:slug`) is the only page whose CSP allows `form-action https:`; its
  POST endpoint only ever redirects to the listing's stored `https://` website.
* **The scanner** runs in-process on shared hosting (guards in §3), with test-only loopback access gated
  by `SCANNER_ALLOW_PRIVATE_FOR_TESTS` **and** a localhost `PUBLIC_ORIGIN`.
* **Error responses** use real status codes: 404 (pages and `/api/*` as JSON), 403 via `forbidden()`
  (`experimental.authInterrupts`; admin page denials are audited), 500 from error boundaries, and a
  maintenance 503 with `Retry-After` served by the proxy. The "application unavailable" page never
  names a listing that was never published and never shows moderation reasons.
* **Static fallback pages** (`public/errors/*.html`) carry their own CSP (`default-src 'none'`, inline
  styles only) because they bypass the proxy.
* **Service worker** never stores pages rendered for a signed-in visitor: the proxy adds
  `x-wc-personal: 1` when a session cookie is present, in addition to the path exclusions.
* **Test-only routes** (`/e2e-test/*`) need `ENABLE_TEST_ERROR_ROUTES=true` **and** a localhost
  `PUBLIC_ORIGIN`; otherwise they return 404.
* **`api.webcenta.com`** (optional) serves `/api/*` only; host-only session cookies never reach it.
* **Every migration** ends with the standard RLS and Data API privilege-revocation footer
  (`prisma/rls-footer.sql`).
