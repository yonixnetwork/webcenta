import { z } from "zod";

/**
 * Server-side environment, parsed once. Never import this from client components.
 * Only non-secret, non-hosting-specific defaults are provided here.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** "disable" | "require" (encrypt, no verification) | "verify-full" (encrypt + verify CA). */
  DATABASE_SSL: z.enum(["disable", "require", "verify-full"]).optional(),
  /** PEM of the database CA (Supabase: Database Settings → SSL → Download certificate). */
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
  ADMIN_ORIGIN: z.string().url().default("http://admin.localhost:3000"),
  DEVELOPER_ORIGIN: z.string().url().default("http://developers.localhost:3000"),

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
