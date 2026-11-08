import { z } from "zod";

/**
 * Server-side environment, parsed once. Never import this from client components.
 * Only non-secret, non-hosting-specific defaults are provided here.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE (Hostinger: host 127.0.0.1, not localhost). */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").refine((v) => /^(mysql|mariadb):\/\//.test(v), "DATABASE_URL must start with mysql://"),
  /** "disable" | "require" (encrypt, no verification) | "verify-full" (encrypt + verify CA). */
  DATABASE_SSL: z.enum(["disable", "require", "verify-full"]).optional(),
  /** PEM of the database server's CA, only for a remote database over TLS (not needed on Hostinger). */
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
  /** Optional: default "admin." + the public host (see originsFromEnv in src/lib/hosts.ts). */
  ADMIN_ORIGIN: z.string().url().optional(),
  DEVELOPER_ORIGIN: z.string().url().optional(),

  /** Header carrying the visitor's ISO country, e.g. "cf-ipcountry" behind Cloudflare. */
  GEO_COUNTRY_HEADER: z.string().default("cf-ipcountry"),
  /** What to do with geo-restricted listings when the country is unknown. */
  GEO_UNKNOWN_POLICY: z.enum(["allow", "deny"]).default("deny"),
  /** Number of trusted reverse proxies in front of the app (for X-Forwarded-For). */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  ANALYTICS_SALT_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  JOBS_TICK_BUDGET_MS: z.coerce.number().int().min(1000).max(120_000).default(25_000),

  MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),

  // --- Auth ---
  USER_AUTH_SECRET: z.string().optional(),
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_SECRET: z.string().optional(),
  APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),
  /** Comma-separated IPs/CIDR-free exact IPs allowed to reach admin (optional). */
  ADMIN_IP_ALLOWLIST: z.string().optional(),

  // --- Email ---
  EMAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  EMAIL_FROM: z.string().optional(),

  // --- Storage ---
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // --- Security scanning providers (optional; checks are skipped and marked so when absent) ---
  GOOGLE_WEB_RISK_API_KEY: z.string().optional(),
  URLHAUS_AUTH_KEY: z.string().optional(),
  VIRUSTOTAL_API_KEY: z.string().optional(),
  /** Test-only: allow scanning hosts on loopback (NEVER set in production). */
  SCANNER_ALLOW_PRIVATE_FOR_TESTS: z.enum(["true", "false"]).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment configuration: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

export function hostOf(origin: string): string {
  return new URL(origin).host.toLowerCase();
}
