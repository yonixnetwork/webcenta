import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { getSection } from "@/server/settings/store";
import { derivedSecret } from "@/server/settings/keys";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";

/**
 * Public user authentication (marketplace + developer portal). Administrators
 * use a completely separate system (src/server/admin/auth.ts).
 *
 * Providers: email + password (verification required) and the social providers
 * an administrator has enabled and configured in Admin → Settings (or, for
 * Google and Apple, through environment variables). The instance is rebuilt
 * whenever those settings change, so no restart is needed.
 */
export interface AuthOptions {
  google?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; clientSecret: string; appBundleIdentifier?: string };
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

export async function authOptions(): Promise<AuthOptions> {
  const [google, apple, github, microsoft, security] = await Promise.all(["google", "apple", "github", "microsoft", "security"].map(getSection));
  return {
    google: google!.ready ? { clientId: google!.str("clientId"), clientSecret: google!.str("clientSecret") } : undefined,
    apple: apple!.ready ? { clientId: apple!.str("clientId"), clientSecret: apple!.str("clientSecret"), ...(apple!.str("bundleId") ? { appBundleIdentifier: apple!.str("bundleId") } : {}) } : undefined,
    github: github!.ready ? { clientId: github!.str("clientId"), clientSecret: github!.str("clientSecret") } : undefined,
    microsoft: microsoft!.ready ? { clientId: microsoft!.str("clientId"), clientSecret: microsoft!.str("clientSecret"), tenantId: microsoft!.str("tenantId") || "common" } : undefined,
    allowSignups: security!.bool("allowSignups"),
    sessionDays: security!.num("sessionDays") || 30,
  };
}

function buildAuth(o: AuthOptions) {
  const e = env();
  const secure = e.PUBLIC_ORIGIN.startsWith("https://");
  const { google, apple, github, microsoft } = o;
  const social = { disableSignUp: !o.allowSignups };

  return betterAuth({
    appName: "Webcenta",
    baseURL: e.PUBLIC_ORIGIN,
    basePath: "/api/auth",
    secret: userAuthSecret(e),
    database: prismaAdapter(db, { provider: "mysql" }),
    trustedOrigins: [e.PUBLIC_ORIGIN, ...(apple ? ["https://appleid.apple.com"] : [])],
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
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "apple"] } }, // Microsoft and GitHub emails are not trusted for automatic linking
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
      cookiePrefix: "wc",
      useSecureCookies: secure,
      database: { generateId: false },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    databaseHooks: {
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
const g = globalThis as unknown as { __webcentaAuth?: { key: string; auth: Auth } };

/** The Better Auth instance for the current settings (rebuilt when they change). */
export async function auth(): Promise<Auth> {
  const o = await authOptions();
  const key = createHash("sha256").update(JSON.stringify(o)).digest("hex");
  if (g.__webcentaAuth?.key !== key) g.__webcentaAuth = { key, auth: buildAuth(o) };
  return g.__webcentaAuth.auth;
}

export async function enabledSocialProviders(): Promise<SocialProvider[]> {
  const o = await authOptions();
  return (["google", "apple", "github", "microsoft"] as const).filter((p) => o[p]);
}

export async function signupsAllowed(): Promise<boolean> {
  return (await authOptions()).allowSignups;
}
