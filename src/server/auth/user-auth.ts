import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { originsFromEnv } from "@/lib/hosts";
import { appleClientSecret } from "./apple";
import { db } from "@/server/db";
import { getSection } from "@/server/settings/store";
import { derivedSecret } from "@/server/settings/keys";
import { sendEmail } from "@/server/email/send";
import { MIN_SIGNUP_AGE, ageOn, parseBirthDate, ratingForAge } from "@/lib/age";
import { actionEmail } from "@/server/email/templates";

/**
 * User authentication for the public marketplace (webcenta.com) and the
 * developer portal (developers.webcenta.com). Both use the same user accounts
 * but separate Better Auth instances: each has its own base URL (OAuth
 * callbacks, email links) and its own host-only session cookie ("wc" and
 * "wcdev"), so the two sites never share or overwrite each other's session.
 * Administrators use a completely separate system (src/server/admin/auth.ts).
 *
 * Providers: email + password (verification required) and the social providers
 * an administrator has enabled and configured in Admin → Settings (or, for
 * Google and Apple, through environment variables). The instance is rebuilt
 * whenever those settings change, so no restart is needed.
 */
export interface AuthOptions {
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string; appBundleIdentifier?: string; secretExpiresAt?: number };
  github?: { clientId: string; clientSecret: string };
  microsoft?: { clientId: string; clientSecret: string; tenantId: string };
  allowSignups: boolean;
  sessionDays: number;
}
import type { SocialProvider } from "@/lib/social-providers";
export type { SocialProvider };

/**
 * Session-signing secret: USER_AUTH_SECRET when set, otherwise derived from
 * FIELD_ENCRYPTION_KEY (one less secret to manage). Production needs one of them.
 */
export function userAuthSecret(e = env()): string {
  if (e.USER_AUTH_SECRET) {
    if (e.NODE_ENV === "production" && e.USER_AUTH_SECRET.length < 32) throw new Error("USER_AUTH_SECRET must be at least 32 characters");
    return e.USER_AUTH_SECRET;
  }
  return derivedSecret("user-auth");
}

export type AuthSurface = "public" | "developer";

/** The surface of the current request (set by the proxy from the hostname; clients cannot set it). */
export async function currentAuthSurface(): Promise<AuthSurface> {
  try {
    return (await headers()).get("x-webcenta-surface") === "developer" ? "developer" : "public";
  } catch {
    return "public"; // outside a request (scripts, jobs, tests)
  }
}

export async function authOptions(surface: AuthSurface = "public"): Promise<AuthOptions> {
  const [google, apple, github, microsoft, security] = await Promise.all(["google", "apple", "github", "microsoft", "security"].map(getSection));
  let appleOpt: AuthOptions["apple"];
  if (apple!.ready) {
    // Preferred: generate the client secret from the Sign in with Apple key; else a stored JWT.
    const key = apple!.str("privateKey") && apple!.str("teamId") && apple!.str("keyId")
      ? appleClientSecret({ teamId: apple!.str("teamId"), keyId: apple!.str("keyId"), clientId: apple!.str("clientId"), privateKey: apple!.str("privateKey") })
      : apple!.str("clientSecret") ? { jwt: apple!.str("clientSecret"), expiresAt: undefined } : null;
    if (key) appleOpt = { clientId: apple!.str("clientId"), clientSecret: key.jwt, secretExpiresAt: key.expiresAt, ...(apple!.str("bundleId") ? { appBundleIdentifier: apple!.str("bundleId") } : {}) };
  }
  return {
    google: google!.ready ? { clientId: google!.str("clientId"), clientSecret: google!.str("clientSecret") } : undefined,
    apple: appleOpt,
    // A GitHub OAuth App has one callback URL, so the developer portal uses its own app (optional).
    github: !github!.ready ? undefined
      : surface === "public" ? { clientId: github!.str("clientId"), clientSecret: github!.str("clientSecret") }
      : github!.str("devClientId") && github!.str("devClientSecret") ? { clientId: github!.str("devClientId"), clientSecret: github!.str("devClientSecret") } : undefined,
    microsoft: microsoft!.ready ? { clientId: microsoft!.str("clientId"), clientSecret: microsoft!.str("clientSecret"), tenantId: microsoft!.str("tenantId") || "common" } : undefined,
    allowSignups: security!.bool("allowSignups"),
    sessionDays: security!.num("sessionDays") || 30,
  };
}

function buildAuth(o: AuthOptions, surface: AuthSurface) {
  const e = env();
  const origins = originsFromEnv(e);
  const baseURL = surface === "developer" ? origins.developerOrigin : origins.publicOrigin;
  const secure = baseURL.startsWith("https://");
  const { google, apple, github, microsoft } = o;
  const social = { disableSignUp: !o.allowSignups };

  return betterAuth({
    appName: "Webcenta",
    baseURL,
    basePath: "/api/auth",
    secret: userAuthSecret(e),
    database: prismaAdapter(db, { provider: "mysql" }),
    trustedOrigins: [baseURL, ...(apple ? ["https://appleid.apple.com"] : [])],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !o.allowSignups,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        const m = actionEmail({ title: "Reset your password", intro: "Someone (hopefully you) asked to reset the password for your Webcenta account.", actionLabel: "Choose a new password", url, outro: "This link expires in 1 hour. If you did not ask for this, you can ignore this email." });
        await sendEmail({ to: user.email, subject: "Reset your Webcenta password", template: "reset-password", ...m });
        await db.authEvent.create({ data: { userId: user.id, type: "PASSWORD_RESET_REQUESTED" } });
      },
      onPasswordReset: async ({ user }) => {
        await db.authEvent.create({ data: { userId: user.id, type: "PASSWORD_RESET_COMPLETED" } });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        const m = actionEmail({ title: "Confirm your email", intro: `Welcome to Webcenta, ${user.name}. Please confirm your email address to finish creating your account.`, actionLabel: "Confirm email", url, outro: "This link expires in 24 hours." });
        await sendEmail({ to: user.email, subject: "Confirm your Webcenta email", template: "verify-email", ...m });
      },
      afterEmailVerification: async (user) => {
        await db.authEvent.create({ data: { userId: user.id, type: "EMAIL_VERIFIED" } });
      },
    },
    socialProviders: {
      ...(google ? { google: { ...google, ...social } } : {}),
      ...(apple ? { apple: { ...apple, ...social } } : {}),
      ...(github ? { github: { ...github, ...social } } : {}),
      ...(microsoft ? { microsoft: { ...microsoft, ...social } } : {}),
    },
    // A social sign-in joins an existing account only when BOTH the provider reports
    // the email as verified AND the existing account's email was verified with us.
    // No provider is trusted blindly, so an unverified address can never be used to
    // take over (or pre-register) someone else's account.
    account: { accountLinking: { enabled: true, trustedProviders: [], requireLocalEmailVerified: true, allowDifferentEmails: false } },
    session: { expiresIn: 60 * 60 * 24 * o.sessionDays, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: e.NODE_ENV !== "test",
      storage: "database",
      modelName: "authRateLimit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 300, max: 10 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/send-verification-email": { window: 3600, max: 5 },
        "/change-password": { window: 3600, max: 10 },
      },
    },
    advanced: {
      // Host-only cookies with a distinct name per site: "wc" (webcenta.com) and "wcdev"
      // (developers.webcenta.com). The admin portal uses its own __Host- cookie.
      cookiePrefix: surface === "developer" ? "wcdev" : "wc",
      useSecureCookies: secure,
      database: { generateId: false },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    // Date of birth, asked at sign-up (social sign-ins are asked once afterwards). It sets the
    // highest content rating the account may see and cannot be changed through the auth API.
    user: {
      additionalFields: {
        birthDate: { type: "date", required: false, input: true, returned: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const raw = (user as { birthDate?: unknown }).birthDate;
            if (raw === undefined || raw === null) return { data: { ...user, birthDate: null } };
            const birthDate = parseBirthDate(raw);
            if (!birthDate || ageOn(birthDate) < MIN_SIGNUP_AGE) return false;
            const rating = ratingForAge(ageOn(birthDate));
            return { data: { ...user, birthDate, maxAgeRating: rating === "AGE_18_PLUS" ? "AGE_18_PLUS" : rating, adultConfirmedAt: rating === "AGE_18_PLUS" ? new Date() : null } };
          },
        },
        update: {
          // Only Webcenta's own account settings may set the date of birth (once).
          before: async (data) => {
            if (!("birthDate" in data)) return;
            const rest = { ...data } as Record<string, unknown>;
            delete rest.birthDate;
            return { data: rest };
          },
        },
      },
      session: {
        create: {
          // Suspended accounts and accounts pending deletion cannot sign in.
          before: async (session) => {
            const u = await db.user.findUnique({ where: { id: session.userId }, select: { status: true } });
            if (!u || u.status !== "ACTIVE") return false;
          },
          after: async (session) => {
            await db.authEvent.create({ data: { userId: session.userId, type: "LOGIN_SUCCESS", ipAddress: session.ipAddress ?? null, userAgent: session.userAgent ?? null } });
          },
        },
      },
    },
    hooks: {},
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof buildAuth>;
const g = globalThis as unknown as { __webcentaAuth?: Partial<Record<AuthSurface, { key: string; auth: Auth }>> };

/**
 * The Better Auth instance for a surface and the current settings (rebuilt when
 * they change). Without an argument, the surface of the current request.
 */
export async function auth(surface?: AuthSurface): Promise<Auth> {
  const s = surface ?? (await currentAuthSurface());
  const o = await authOptions(s);
  const key = createHash("sha256").update(JSON.stringify(o)).digest("hex");
  const cache = (g.__webcentaAuth ??= {});
  if (cache[s]?.key !== key) cache[s] = { key, auth: buildAuth(o, s) };
  return cache[s]!.auth;
}

/** Name of the session cookie for a surface (with the __Secure- prefix on https). */
export function sessionCookieNames(surface: AuthSurface): string[] {
  const base = `${surface === "developer" ? "wcdev" : "wc"}.session_token`;
  return [base, `__Secure-${base}`];
}

export async function enabledSocialProviders(surface?: AuthSurface): Promise<SocialProvider[]> {
  const o = await authOptions(surface ?? (await currentAuthSurface()));
  return (["google", "apple", "github", "microsoft"] as const).filter((p) => o[p]);
}

export async function signupsAllowed(): Promise<boolean> {
  return (await authOptions()).allowSignups;
}
