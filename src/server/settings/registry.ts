/**
 * Declarative definition of every admin-configurable setting. Pure data: no
 * database access, safe to import anywhere on the server.
 *
 * Each section is stored as one encrypted-where-needed record in MySQL
 * (src/server/settings/store.ts) and read at runtime by the code named in
 * `usedBy`. A field with `env` falls back to that environment variable when
 * nothing has been saved, so existing deployments keep working.
 */
import { validateApplePrivateKey } from "@/server/auth/apple";


export type FieldType = "text" | "secret" | "url" | "email" | "number" | "boolean" | "select" | "textarea" | "color";

export interface FieldDef {
  key: string;
  label: string;
  help: string;
  type: FieldType;
  /** Required for the section to count as configured (when enabled). */
  required?: boolean;
  /** Environment variable used when no value has been saved. */
  env?: string;
  default?: string | number | boolean;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  /** Regular expression the value must match, with a message. */
  pattern?: { source: string; message: string };
  placeholder?: string;
  /** Only shown/used when another field has this value (e.g. S3 fields when driver = s3). */
  when?: { key: string; equals: string | boolean };
  /** Multi-line input (e.g. a private key). For secrets, whitespace is kept. */
  multiline?: boolean;
  /** Extra server-side validation; returns an error message or null. */
  validate?: (value: string) => string | null;
}

export type Apply = "immediate" | "restart" | "redeploy";

export interface SectionDef {
  id: string;
  group: string;
  title: string;
  description: string;
  /** What in the application reads this section (shown to admins; keeps us honest). */
  usedBy: string;
  fields: FieldDef[];
  /** Has an Enable/Disable switch. */
  toggle?: boolean;
  /** Enabled state to assume when nothing is saved (e.g. derived from env). */
  envEnabled?: (e: Record<string, string | undefined>) => boolean;
  /** When a saved change takes effect. */
  apply: Apply;
  applyNote?: string;
  /** Who may edit. Credentials require integrations.manage (Super Administrators). */
  permission: "settings.manage" | "integrations.manage";
  /** A real connection test exists (src/server/settings/testers.ts). */
  testable?: boolean;
  testNote?: string;
  /** Where to obtain credentials. */
  provider?: { name: string; url: string; cost?: string };
  /** Shown prominently: limitations, legal notes, inactive features. */
  warning?: string;
  /** Read-only status page (no saved fields). */
  statusOnly?: boolean;
  /**
   * Alternative sets of fields: the section is complete when every field of at
   * least one set has a value (e.g. Apple: a signing key, or a ready-made JWT).
   */
  requireOneOf?: string[][];
  /** OAuth callback path to show with each site's origin (to register with the provider). */
  callbackPath?: string;
}

/** The categories of Admin → Settings, in display order. */
export const CATEGORIES = [
  "Application and website", "Database", "Authentication and sessions", "Google OAuth", "Apple OAuth", "GitHub OAuth",
  "Email and SMTP", "Payments", "Advertising", "Analytics", "File storage", "Security scanning", "Notifications",
  "External APIs", "Developer services", "Background jobs", "PWA", "System and deployment",
] as const;

const HTTPS_URL = { source: "^https://\\S+$", message: "Use an https:// address." };
const opt = (...v: Array<[string, string]>) => v.map(([value, label]) => ({ value, label }));

export const SECTIONS: SectionDef[] = [
  // ---------------------------------------------------------------- Website
  {
    id: "general",
    group: "Application and website",
    title: "General",
    description: "Site name, description, contact address and the banner shown above every public page.",
    usedBy: "Page titles and metadata, the footer, the public banner, the contact page.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "siteName", label: "Site name", help: "Used in page titles, social previews and the footer.", type: "text", default: "Webcenta", required: true },
      { key: "siteDescription", label: "Default description", help: "Shown in search results and social previews when a page has no description of its own (up to 300 characters).", type: "textarea", max: 300, default: "Discover, compare and safely visit websites, web apps, AI tools and online services from around the world." },
      { key: "contactEmail", label: "Public contact email", help: "Shown on the contact page and in the footer. Leave empty to show only the contact form.", type: "email" },
      { key: "bannerText", label: "Site banner", help: "Short notice shown above every public page (e.g. \"Beta\" or \"Staging\"). Leave empty for none.", type: "text", env: "SITE_BANNER", max: 200 },
    ],
  },
  {
    id: "seo",
    group: "Application and website",
    title: "Branding & SEO",
    description: "Search-engine indexing, default title, social preview image and social handles.",
    usedBy: "robots.txt, page metadata (titles, Open Graph, Twitter cards) and the noindex header.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "defaultTitle", label: "Home page title", help: "The <title> of the home page and the fallback title elsewhere.", type: "text", default: "Webcenta — Discover the best web apps", max: 120 },
      { key: "allowIndexing", label: "Allow search engines to index the site", help: "Turn off for a staging copy. When off, robots.txt disallows everything and pages carry noindex.", type: "boolean", default: true },
      { key: "ogImageUrl", label: "Default social preview image", help: "An https:// image (1200×630 recommended) used when a page has no image of its own.", type: "url", pattern: HTTPS_URL },
      { key: "twitterHandle", label: "X (Twitter) handle", help: "Without @, used for Twitter cards.", type: "text", pattern: { source: "^[A-Za-z0-9_]{1,15}$", message: "1–15 letters, digits or underscores, without @." } },
    ],
  },
  {
    id: "pwa",
    group: "PWA",
    title: "PWA & app",
    description: "How Webcenta appears when installed as an app on phones and computers.",
    usedBy: "The web app manifest (/manifest.webmanifest).",
    permission: "settings.manage",
    apply: "immediate",
    applyNote: "Installed apps pick up a new name or colour the next time the device refreshes the manifest (usually within a day).",
    fields: [
      { key: "appName", label: "App name", help: "Full name shown when installing.", type: "text", default: "Webcenta — Web app discovery", max: 60 },
      { key: "shortName", label: "Short name", help: "Shown under the home-screen icon (12 characters or fewer).", type: "text", default: "Webcenta", max: 12 },
      { key: "description", label: "App description", help: "Shown in install prompts.", type: "text", default: "Discover, compare and safely visit web apps, AI tools and online services.", max: 200 },
      { key: "themeColor", label: "Theme colour", help: "Colour of the title bar of the installed app.", type: "color", default: "#4f46e5" },
      { key: "backgroundColor", label: "Splash background colour", help: "Background shown while the installed app starts.", type: "color", default: "#f7f7fb" },
    ],
  },
  {
    id: "social",
    group: "Application and website",
    title: "Social profiles",
    description: "Links to Webcenta's own social media profiles.",
    usedBy: "Footer links and the organisation's structured data (sameAs) for search engines.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "x", label: "X (Twitter)", help: "Full profile URL.", type: "url", pattern: HTTPS_URL, placeholder: "https://x.com/webcenta" },
      { key: "facebook", label: "Facebook", help: "Full page URL.", type: "url", pattern: HTTPS_URL },
      { key: "instagram", label: "Instagram", help: "Full profile URL.", type: "url", pattern: HTTPS_URL },
      { key: "linkedin", label: "LinkedIn", help: "Full company page URL.", type: "url", pattern: HTTPS_URL },
      { key: "youtube", label: "YouTube", help: "Full channel URL.", type: "url", pattern: HTTPS_URL },
      { key: "tiktok", label: "TikTok", help: "Full profile URL.", type: "url", pattern: HTTPS_URL },
      { key: "github", label: "GitHub", help: "Full organisation URL.", type: "url", pattern: HTTPS_URL },
    ],
  },

  // ---------------------------------------------------------------- Platform
  {
    id: "database",
    group: "Database",
    title: "Database",
    description: "Connection status, version, size and migrations of the MySQL / MariaDB database.",
    usedBy: "Everything. The connection itself comes from DATABASE_URL in the hosting environment and cannot be changed here: the application needs it before it can read any settings.",
    permission: "settings.manage",
    apply: "redeploy",
    statusOnly: true,
    fields: [],
  },
  {
    id: "marketplace",
    group: "Application and website",
    title: "Marketplace",
    description: "Search results per page and what counts as \"highly rated\".",
    usedBy: "Search and category pages, the \"Highly rated\" filter and homepage rail, \"better rated\" alternatives.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "searchPageSize", label: "Results per page", help: "Listings per search or category page (12–60).", type: "number", default: 24, min: 12, max: 60 },
      { key: "highlyRatedMinRatings", label: "\"Highly rated\": minimum number of ratings", help: "A listing needs at least this many published ratings to appear as highly rated.", type: "number", default: 5, min: 1, max: 100 },
      { key: "highlyRatedMinAverage", label: "\"Highly rated\": minimum average", help: "And at least this average (1–5).", type: "number", default: 4, min: 1, max: 5 },
    ],
  },
  {
    id: "developer",
    group: "Developer services",
    title: "Developer portal",
    description: "Who can create developer organisations and how domains can be verified.",
    usedBy: "Organisation creation, new submissions and domain verification in the developer portal.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "allowNewOrganizations", label: "Allow new developer organisations", help: "When off, existing organisations keep working but no new ones can be created.", type: "boolean", default: true },
      { key: "maxDraftsPerOrg", label: "Maximum unpublished listings per organisation", help: "Drafts and submissions not yet published (1–500).", type: "number", default: 25, min: 1, max: 500 },
      { key: "verifyDnsTxt", label: "Domain verification by DNS TXT record", help: "Allow verifying a domain with a TXT record.", type: "boolean", default: true },
      { key: "verifyHtmlMeta", label: "Domain verification by HTML meta tag", help: "Allow verifying a domain with a meta tag on its homepage.", type: "boolean", default: true },
      { key: "verifyWellKnown", label: "Domain verification by well-known file", help: "Allow verifying a domain with /.well-known/webcenta-verification.txt.", type: "boolean", default: true },
    ],
  },
  {
    id: "jobs",
    group: "Background jobs",
    title: "Scheduled tasks",
    description: "The secret the hosting cron job sends, how long each run may take, and the queue's health.",
    usedBy: "POST /api/cron/tick (Hostinger Cron) and the job runner (emails, analytics roll-ups, scans, clean-up).",
    permission: "integrations.manage",
    apply: "immediate",
    fields: [
      { key: "cronSecret", label: "Cron secret", help: "At least 32 characters. The cron job sends it as \"Authorization: Bearer <secret>\". After changing it, update the cron command in hPanel.", type: "secret", env: "CRON_SECRET", required: true, pattern: { source: "^\\S{32,256}$", message: "At least 32 characters, no spaces." } },
      { key: "tickBudgetMs", label: "Time budget per run (ms)", help: "How long one cron run may work (1 000–120 000 ms). Keep it below the hosting request timeout.", type: "number", env: "JOBS_TICK_BUDGET_MS", default: 25_000, min: 1000, max: 120_000 },
    ],
  },

  // ---------------------------------------------------------------- Email & notifications
  {
    id: "email",
    group: "Email and SMTP",
    title: "Email (SMTP)",
    description: "Outgoing email: account verification, password resets, notifications and admin alerts.",
    usedBy: "Every email Webcenta sends. When disabled, emails are recorded in Admin → Jobs & email but not sent.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => e.EMAIL_TRANSPORT === "smtp",
    apply: "immediate",
    testable: true,
    testNote: "Connects and signs in to the SMTP server, then sends a test email to your admin address.",
    provider: { name: "Hostinger Email (hPanel → Emails) or any SMTP provider", url: "https://hpanel.hostinger.com/" },
    fields: [
      { key: "host", label: "SMTP server", help: "Hostinger: smtp.hostinger.com.", type: "text", env: "SMTP_HOST", required: true, placeholder: "smtp.hostinger.com" },
      { key: "port", label: "Port", help: "465 (SSL) or 587 (STARTTLS).", type: "number", env: "SMTP_PORT", default: 465, min: 1, max: 65535, required: true },
      { key: "secure", label: "Use SSL/TLS from the start", help: "On for port 465; off for 587 (STARTTLS is then negotiated).", type: "boolean", env: "SMTP_SECURE", default: true },
      { key: "user", label: "Username", help: "Usually the full mailbox address.", type: "text", env: "SMTP_USER", required: true },
      { key: "password", label: "Password", help: "The mailbox password.", type: "secret", env: "SMTP_PASSWORD", required: true },
      { key: "from", label: "From address", help: "e.g. Webcenta <noreply@webcenta.com>. Must be the mailbox above or an address it may send as.", type: "text", env: "EMAIL_FROM", required: true, default: "Webcenta <noreply@webcenta.com>" },
    ],
  },
  {
    id: "notifications",
    group: "Notifications",
    title: "Notifications",
    description: "Who receives administrator alerts and whether user notifications are also emailed.",
    usedBy: "Admin alerts (security alerts, appeals, sponsorship requests) and the email copy of in-app user notifications.",
    permission: "settings.manage",
    apply: "immediate",
    fields: [
      { key: "adminAlertEmails", label: "Admin alert recipients", help: "Comma-separated addresses. Leave empty to email every active administrator.", type: "textarea", max: 2000 },
      { key: "emailAdminAlerts", label: "Email administrators about alerts", help: "In-app alerts are always created; this controls the email copy.", type: "boolean", default: true },
      { key: "emailUserNotifications", label: "Email users about their notifications", help: "Users can still turn this off for themselves. When off here, nobody receives notification emails.", type: "boolean", default: true },
    ],
  },

  // ---------------------------------------------------------------- Sign-in
  {
    id: "security",
    group: "Authentication and sessions",
    title: "Security & authentication",
    description: "Sign-ups, session length, admin IP restriction, client IPs and country detection.",
    usedBy: "Account sign-up and sessions, the admin portal, rate limits, analytics and geo-restrictions.",
    permission: "integrations.manage",
    apply: "immediate",
    fields: [
      { key: "allowSignups", label: "Allow new user accounts", help: "When off, the sign-up form is hidden and new accounts are refused (existing users can still sign in).", type: "boolean", default: true },
      { key: "sessionDays", label: "User session length (days)", help: "How long a user stays signed in without activity (1–90).", type: "number", default: 30, min: 1, max: 90 },
      { key: "adminIpAllowlist", label: "Admin portal IP allow-list", help: "Comma-separated IP addresses allowed to use the admin portal. Leave empty to allow any address (sign-in still needs a password and two-factor code). Add your own IP first.", type: "textarea", env: "ADMIN_IP_ALLOWLIST", max: 2000 },
      { key: "trustedProxyHops", label: "Trusted proxies in front of the app", help: "How many proxies append to X-Forwarded-For (Hostinger: 1; Hostinger CDN or Cloudflare in front may add one).", type: "number", env: "TRUSTED_PROXY_HOPS", default: 1, min: 0, max: 5 },
      { key: "geoCountryHeader", label: "Country header", help: "Request header carrying the visitor's country code. Cloudflare: cf-ipcountry.", type: "text", env: "GEO_COUNTRY_HEADER", default: "cf-ipcountry" },
      { key: "geoUnknownPolicy", label: "When the country is unknown", help: "Hide or show listings that are restricted to certain countries.", type: "select", env: "GEO_UNKNOWN_POLICY", default: "deny", options: opt(["deny", "Hide country-restricted listings"], ["allow", "Show them"]) },
    ],
  },
  {
    id: "google",
    group: "Google OAuth",
    title: "Google sign-in",
    description: "\"Continue with Google\" on the marketplace and the developer portal.",
    usedBy: "Sign-in and sign-up pages of webcenta.com and developers.webcenta.com, and account linking.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    apply: "immediate",
    testable: true,
    testNote: "Sends Google a deliberately invalid authorisation code with your client ID and secret: Google answers differently for a valid and an invalid client. A full check still needs one real sign-in.",
    provider: { name: "Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)", url: "https://console.cloud.google.com/apis/credentials" },
    callbackPath: "/api/auth/callback/google",
    fields: [
      { key: "clientId", label: "Client ID", help: "Ends with .apps.googleusercontent.com.", type: "text", env: "GOOGLE_CLIENT_ID", required: true, pattern: { source: "^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$", message: "A Google client ID ends with .apps.googleusercontent.com." } },
      { key: "clientSecret", label: "Client secret", help: "From the same OAuth client.", type: "secret", env: "GOOGLE_CLIENT_SECRET", required: true },
    ],
  },
  {
    id: "apple",
    group: "Apple OAuth",
    title: "Apple sign-in",
    description: "\"Sign in with Apple\" on the marketplace and the developer portal.",
    usedBy: "Sign-in and sign-up pages of webcenta.com and developers.webcenta.com, and account linking.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.APPLE_CLIENT_ID && (e.APPLE_PRIVATE_KEY || e.APPLE_CLIENT_SECRET)),
    apply: "immediate",
    testable: true,
    testNote: "Generates the client secret from your key, checks it, then sends Apple a deliberately invalid authorisation code: Apple answers differently for a valid and an invalid client. A full check still needs one real sign-in.",
    provider: { name: "Apple Developer → Certificates, Identifiers & Profiles (a Services ID and a Sign in with Apple key)", url: "https://developer.apple.com/account/resources/identifiers/list/serviceId", cost: "Apple Developer Program, US$99/year" },
    warning: "In the Services ID, add both domains (webcenta.com and developers.webcenta.com) and both return URLs shown below. Webcenta generates the client secret from your key and renews it automatically.",
    callbackPath: "/api/auth/callback/apple",
    requireOneOf: [["teamId", "keyId", "privateKey"], ["clientSecret"]],
    fields: [
      { key: "clientId", label: "Services ID", help: "The identifier of the Services ID (e.g. com.webcenta.signin), used as the OAuth client ID.", type: "text", env: "APPLE_CLIENT_ID", required: true, pattern: { source: "^[A-Za-z0-9][A-Za-z0-9.-]{2,100}$", message: "A Services ID looks like com.webcenta.signin." } },
      { key: "teamId", label: "Team ID", help: "10 characters, top right of the Apple Developer site.", type: "text", env: "APPLE_TEAM_ID", pattern: { source: "^[A-Z0-9]{10}$", message: "A Team ID is 10 capital letters or digits." } },
      { key: "keyId", label: "Key ID", help: "10 characters, shown with the Sign in with Apple key.", type: "text", env: "APPLE_KEY_ID", pattern: { source: "^[A-Z0-9]{10}$", message: "A Key ID is 10 capital letters or digits." } },
      { key: "privateKey", label: "Private key (.p8)", help: "Paste the whole contents of the AuthKey_XXXXXXXXXX.p8 file. It is encrypted and never shown again.", type: "secret", env: "APPLE_PRIVATE_KEY", multiline: true, validate: validateApplePrivateKey },
      { key: "clientSecret", label: "Client secret JWT (legacy, optional)", help: "Only if you cannot provide the key: a pre-generated client-secret JWT. It expires after at most 6 months.", type: "secret", env: "APPLE_CLIENT_SECRET" },
      { key: "bundleId", label: "App bundle ID (optional)", help: "Only if a native iOS app also signs in.", type: "text", env: "APPLE_APP_BUNDLE_IDENTIFIER" },
    ],
  },
  {
    id: "github",
    group: "GitHub OAuth",
    title: "GitHub sign-in",
    description: "\"Continue with GitHub\" on the marketplace and the developer portal.",
    usedBy: "Sign-in and sign-up pages of webcenta.com and developers.webcenta.com, and account linking.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET),
    apply: "immediate",
    testable: true,
    testNote: "Sends GitHub a deliberately invalid authorisation code with your client ID and secret: GitHub answers differently for a valid and an invalid client. A full check still needs one real sign-in.",
    provider: { name: "GitHub → Settings → Developer settings → OAuth Apps", url: "https://github.com/settings/developers" },
    warning: "A GitHub OAuth App has a single callback URL. Create one OAuth App for the marketplace and, to offer GitHub on the developer portal too, a second one with the developer-portal callback URL below.",
    callbackPath: "/api/auth/callback/github",
    fields: [
      { key: "clientId", label: "Client ID", help: "From the OAuth App.", type: "text", env: "GITHUB_CLIENT_ID", required: true, pattern: { source: "^[A-Za-z0-9._-]{10,64}$", message: "That does not look like a GitHub client ID." } },
      { key: "clientSecret", label: "Client secret", help: "Generate it in the OAuth App.", type: "secret", env: "GITHUB_CLIENT_SECRET", required: true },
      { key: "devClientId", label: "Developer portal: Client ID (optional)", help: "From a second OAuth App whose callback is the developer-portal URL below. Empty: GitHub is offered on the marketplace only.", type: "text", pattern: { source: "^[A-Za-z0-9._-]{10,64}$", message: "That does not look like a GitHub client ID." } },
      { key: "devClientSecret", label: "Developer portal: Client secret (optional)", help: "From the same second OAuth App.", type: "secret" },
    ],
  },
  {
    id: "microsoft",
    group: "Authentication and sessions",
    title: "Microsoft sign-in",
    description: "\"Continue with Microsoft\" (personal, work and school accounts).",
    usedBy: "Sign-in and sign-up pages, account linking.",
    permission: "integrations.manage",
    toggle: true,
    apply: "immediate",
    testable: true,
    testNote: "Checks the IDs and that Microsoft's sign-in service for the tenant is reachable. A full check needs a real sign-in.",
    provider: { name: "Microsoft Entra admin center → App registrations", url: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
    fields: [
      { key: "clientId", label: "Application (client) ID", help: "A GUID.", type: "text", required: true, pattern: { source: "^[0-9a-fA-F-]{36}$", message: "The application ID is a GUID." } },
      { key: "clientSecret", label: "Client secret value", help: "Certificates & secrets → client secret value.", type: "secret", required: true },
      { key: "tenantId", label: "Tenant", help: "\"common\" for any account, or your directory (tenant) ID.", type: "text", default: "common" },
    ],
  },

  // ---------------------------------------------------------------- Files
  {
    id: "storage",
    group: "File storage",
    title: "Storage & uploads",
    description: "Where developer logos, screenshots and compliance documents are stored.",
    usedBy: "Uploads in the developer and admin portals, /media/* and private document downloads.",
    permission: "integrations.manage",
    apply: "immediate",
    applyNote: "Files already uploaded are not moved when you switch storage.",
    testable: true,
    testNote: "Writes, reads and deletes a small test file in the configured storage.",
    fields: [
      { key: "driver", label: "Storage", help: "\"Hosting disk\" needs no other service. S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3) is optional.", type: "select", env: "STORAGE_DRIVER", default: "local", options: opt(["local", "Hosting disk"], ["s3", "S3-compatible bucket"]) },
      { key: "localDir", label: "Folder on the hosting disk", help: "Absolute path OUTSIDE the app directory, e.g. /home/u123456789/webcenta-storage. Redeploys replace the app directory.", type: "text", env: "STORAGE_LOCAL_DIR", default: "./storage", when: { key: "driver", equals: "local" } },
      { key: "s3Endpoint", label: "S3 endpoint", help: "e.g. https://<account>.r2.cloudflarestorage.com", type: "url", env: "S3_ENDPOINT", pattern: HTTPS_URL, when: { key: "driver", equals: "s3" } },
      { key: "s3Region", label: "Region", help: "\"auto\" for Cloudflare R2.", type: "text", env: "S3_REGION", default: "auto", when: { key: "driver", equals: "s3" } },
      { key: "s3Bucket", label: "Bucket", help: "Bucket name.", type: "text", env: "S3_BUCKET", when: { key: "driver", equals: "s3" } },
      { key: "s3AccessKeyId", label: "Access key ID", help: "A key limited to this bucket.", type: "text", env: "S3_ACCESS_KEY_ID", when: { key: "driver", equals: "s3" } },
      { key: "s3SecretAccessKey", label: "Secret access key", help: "Shown once when you create the key.", type: "secret", env: "S3_SECRET_ACCESS_KEY", when: { key: "driver", equals: "s3" } },
      { key: "mediaPublicBaseUrl", label: "Public media URL (optional)", help: "If the bucket is public behind a CDN, its base URL. Empty: media is served by Webcenta at /media.", type: "url", env: "MEDIA_PUBLIC_BASE_URL", pattern: HTTPS_URL, when: { key: "driver", equals: "s3" } },
    ],
  },

  // ---------------------------------------------------------------- Scanning
  {
    id: "webrisk",
    group: "Security scanning",
    title: "Google Web Risk",
    description: "Checks submitted and monitored websites against Google's unsafe-site lists.",
    usedBy: "Submission checks and scheduled monitoring scans. With at least one provider, low-risk submissions can be approved automatically.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.GOOGLE_WEB_RISK_API_KEY),
    apply: "immediate",
    testable: true,
    testNote: "Looks up a known-safe address with your key.",
    provider: { name: "Google Cloud → Web Risk API", url: "https://cloud.google.com/web-risk", cost: "Commercial terms apply" },
    fields: [{ key: "apiKey", label: "API key", help: "A Google Cloud API key with the Web Risk API enabled.", type: "secret", env: "GOOGLE_WEB_RISK_API_KEY", required: true }],
  },
  {
    id: "urlhaus",
    group: "Security scanning",
    title: "abuse.ch URLhaus",
    description: "Checks websites against URLhaus's database of malware distribution sites.",
    usedBy: "Submission checks and scheduled monitoring scans.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.URLHAUS_AUTH_KEY),
    apply: "immediate",
    testable: true,
    testNote: "Looks up a known-safe address with your key.",
    provider: { name: "abuse.ch authentication portal", url: "https://auth.abuse.ch/", cost: "Free with an account" },
    fields: [{ key: "authKey", label: "Auth-Key", help: "From the abuse.ch authentication portal.", type: "secret", env: "URLHAUS_AUTH_KEY", required: true }],
  },
  {
    id: "virustotal",
    group: "Security scanning",
    title: "VirusTotal",
    description: "Checks websites against VirusTotal's aggregated engine verdicts.",
    usedBy: "Submission checks and scheduled monitoring scans.",
    permission: "integrations.manage",
    toggle: true,
    envEnabled: (e) => Boolean(e.VIRUSTOTAL_API_KEY),
    apply: "immediate",
    testable: true,
    testNote: "Reads your API key's quota from VirusTotal.",
    provider: { name: "VirusTotal → API key", url: "https://www.virustotal.com/gui/my-apikey", cost: "Commercial use needs a paid licence" },
    fields: [{ key: "apiKey", label: "API key", help: "Your VirusTotal API key.", type: "secret", env: "VIRUSTOTAL_API_KEY", required: true }],
  },

  // ---------------------------------------------------------------- Analytics & advertising
  {
    id: "plausible",
    group: "Analytics",
    title: "Plausible Analytics",
    description: "Privacy-friendly, cookie-free visitor statistics, in addition to Webcenta's own analytics.",
    usedBy: "A script on public pages (not on the admin portal), allowed by the Content Security Policy.",
    permission: "settings.manage",
    toggle: true,
    apply: "immediate",
    testable: true,
    testNote: "Checks that the script address responds.",
    provider: { name: "Plausible", url: "https://plausible.io/", cost: "Paid plans; can be self-hosted" },
    fields: [
      { key: "domain", label: "Site domain in Plausible", help: "As added in Plausible, e.g. webcenta.com.", type: "text", required: true, pattern: { source: "^[a-z0-9.-]+\\.[a-z]{2,}$", message: "A domain like webcenta.com." } },
      { key: "scriptUrl", label: "Script URL", help: "Default https://plausible.io/js/script.js; change only if you self-host.", type: "url", default: "https://plausible.io/js/script.js", pattern: HTTPS_URL },
    ],
  },
  {
    id: "ga4",
    group: "Analytics",
    title: "Google Analytics 4",
    description: "Google's visitor analytics.",
    usedBy: "The Google tag on public pages (not on the admin portal), allowed by the Content Security Policy.",
    permission: "settings.manage",
    toggle: true,
    apply: "immediate",
    provider: { name: "Google Analytics → Admin → Data streams", url: "https://analytics.google.com/" },
    warning: "Google Analytics sets cookies. In the EU/UK and other regions you need visitor consent before loading it and must update the privacy policy. Webcenta does not include a consent banner yet.",
    fields: [{ key: "measurementId", label: "Measurement ID", help: "Starts with G-.", type: "text", required: true, pattern: { source: "^G-[A-Z0-9]{4,12}$", message: "A measurement ID looks like G-XXXXXXX." } }],
  },
  {
    id: "adsense",
    group: "Advertising",
    title: "Google AdSense",
    description: "Display advertising on general pages, and the ads.txt file.",
    usedBy: "/ads.txt and the AdSense script on the home, category and search pages. Never on app detail pages, the leaving-Webcenta page, accounts, the developer portal or the admin portal.",
    permission: "settings.manage",
    toggle: true,
    apply: "immediate",
    provider: { name: "Google AdSense", url: "https://adsense.google.com/" },
    warning: "AdSense uses cookies and personalised ads: consent is required in the EU/UK, and the privacy policy must say so. Ads are kept off pages where they could be mistaken for a listing's own content.",
    fields: [
      { key: "publisherId", label: "Publisher ID", help: "pub-0000000000000000 (with or without ca-).", type: "text", required: true, pattern: { source: "^(ca-)?pub-[0-9]{10,20}$", message: "A publisher ID looks like pub-1234567890123456." } },
      { key: "autoAds", label: "Load the AdSense script (Auto ads)", help: "When off, only ads.txt is published.", type: "boolean", default: true },
      { key: "adsTxtExtra", label: "Extra ads.txt lines", help: "Other authorised sellers, one per line.", type: "textarea", max: 5000 },
    ],
  },

  // ---------------------------------------------------------------- Payments
  {
    id: "stripe",
    group: "Payments",
    title: "Stripe",
    description: "Card payments for future paid plans and sponsored placements.",
    usedBy: "Not used yet: billing is intentionally inactive. Credentials can be stored and verified now so they are ready when billing is switched on.",
    permission: "integrations.manage",
    toggle: true,
    apply: "immediate",
    testable: true,
    testNote: "Reads your account balance with the secret key (no charge is made).",
    provider: { name: "Stripe Dashboard → Developers → API keys", url: "https://dashboard.stripe.com/apikeys" },
    warning: "Payments are not active in Webcenta yet. Saving keys here does not charge anyone.",
    fields: [
      { key: "publishableKey", label: "Publishable key", help: "Starts with pk_live_ or pk_test_.", type: "text", required: true, pattern: { source: "^pk_(live|test)_[A-Za-z0-9]+$", message: "Starts with pk_live_ or pk_test_." } },
      { key: "secretKey", label: "Secret key", help: "Starts with sk_live_, sk_test_ or rk_ (restricted key, recommended).", type: "secret", required: true, pattern: { source: "^(sk|rk)_(live|test)_[A-Za-z0-9]+$", message: "Starts with sk_live_, sk_test_ or rk_." } },
      { key: "webhookSecret", label: "Webhook signing secret", help: "Starts with whsec_ (needed once billing is active).", type: "secret", pattern: { source: "^whsec_[A-Za-z0-9]+$", message: "Starts with whsec_." } },
    ],
  },
  {
    id: "paypal",
    group: "Payments",
    title: "PayPal",
    description: "PayPal payments for future paid plans and sponsored placements.",
    usedBy: "Not used yet: billing is intentionally inactive. Credentials can be stored and verified now.",
    permission: "integrations.manage",
    toggle: true,
    apply: "immediate",
    testable: true,
    testNote: "Requests an access token with your app credentials (no payment is made).",
    provider: { name: "PayPal Developer → Apps & Credentials", url: "https://developer.paypal.com/dashboard/applications" },
    warning: "Payments are not active in Webcenta yet.",
    fields: [
      { key: "mode", label: "Environment", help: "Sandbox for testing.", type: "select", default: "sandbox", options: opt(["sandbox", "Sandbox"], ["live", "Live"]) },
      { key: "clientId", label: "Client ID", help: "From your REST API app.", type: "text", required: true },
      { key: "clientSecret", label: "Secret", help: "From your REST API app.", type: "secret", required: true },
    ],
  },

  // ---------------------------------------------------------------- APIs
  {
    id: "webmaster",
    group: "External APIs",
    title: "Search engines & IndexNow",
    description: "Ownership verification for webmaster tools and instant indexing of new listings.",
    usedBy: "Verification meta tags on the home page; IndexNow notifications when a listing is published or changes.",
    permission: "settings.manage",
    apply: "immediate",
    testable: true,
    testNote: "Checks that the IndexNow key file is served by this site.",
    provider: { name: "Google Search Console / Bing Webmaster Tools", url: "https://search.google.com/search-console" },
    fields: [
      { key: "googleVerification", label: "Google Search Console verification code", help: "The content value of the google-site-verification meta tag.", type: "text", max: 200 },
      { key: "bingVerification", label: "Bing verification code", help: "The content value of the msvalidate.01 meta tag.", type: "text", max: 200 },
      { key: "yandexVerification", label: "Yandex verification code", help: "The content value of the yandex-verification meta tag.", type: "text", max: 200 },
      { key: "indexNowKey", label: "IndexNow key", help: "8–128 letters, digits or dashes. Leave empty to turn IndexNow off. Served at /indexnow-key.txt.", type: "text", pattern: { source: "^[A-Za-z0-9-]{8,128}$", message: "8–128 letters, digits or dashes." } },
    ],
  },
];

export function sectionById(id: string): SectionDef | undefined {
  return SECTIONS.find((s) => s.id === id);
}

export const GROUPS: string[] = CATEGORIES.filter((c) => SECTIONS.some((s) => s.group === c));
