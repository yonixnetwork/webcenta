import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";

/**
 * Public user authentication (marketplace + developer portal). Administrators
 * use a completely separate system (src/server/admin/auth.ts).
 *
 * Providers: email + password (verification required), Google and Apple when
 * their credentials are configured. Nothing here reports a provider as working
 * unless its environment variables are present.
 */
function buildAuth() {
  const e = env();
  const secure = e.PUBLIC_ORIGIN.startsWith("https://");
  if (e.NODE_ENV === "production" && (!e.USER_AUTH_SECRET || e.USER_AUTH_SECRET.length < 32)) {
    throw new Error("USER_AUTH_SECRET (≥ 32 chars) is required in production");
  }
  const google = e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : undefined;
  const apple = e.APPLE_CLIENT_ID && e.APPLE_CLIENT_SECRET
    ? { clientId: e.APPLE_CLIENT_ID, clientSecret: e.APPLE_CLIENT_SECRET, ...(e.APPLE_APP_BUNDLE_IDENTIFIER ? { appBundleIdentifier: e.APPLE_APP_BUNDLE_IDENTIFIER } : {}) }
    : undefined;

  return betterAuth({
    appName: "Webcenta",
    baseURL: e.PUBLIC_ORIGIN,
    basePath: "/api/auth",
    secret: e.USER_AUTH_SECRET || "development-only-secret-not-for-production-use-0000",
    database: prismaAdapter(db, { provider: "mysql" }),
    trustedOrigins: [e.PUBLIC_ORIGIN, ...(apple ? ["https://appleid.apple.com"] : [])],
    emailAndPassword: {
      enabled: true,
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
    socialProviders: { ...(google ? { google } : {}), ...(apple ? { apple } : {}) },
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "apple"] } },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
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
const g = globalThis as unknown as { __webcentaAuth?: Auth };
export function auth(): Auth {
  g.__webcentaAuth ??= buildAuth();
  return g.__webcentaAuth;
}

export function enabledSocialProviders(): Array<"google" | "apple"> {
  const e = env();
  return [
    ...(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? (["google"] as const) : []),
    ...(e.APPLE_CLIENT_ID && e.APPLE_CLIENT_SECRET ? (["apple"] as const) : []),
  ];
}
