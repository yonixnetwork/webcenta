import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminRole } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { DUMMY_HASH, decrypt, newToken, sha256, verifyPassword, verifyTotp } from "./crypto";
import { can, type Permission } from "./permissions";

/**
 * Administrator sessions — independent of public user accounts.
 * Host-only cookie on the admin host, SameSite=Strict, 8 h absolute / 30 min idle,
 * MFA (TOTP) required before any admin page or action is allowed.
 */
export const ABSOLUTE_HOURS = 8;
export const IDLE_MINUTES = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export function adminCookieName() {
  return (process.env.ADMIN_ORIGIN ?? "").startsWith("https://") ? "__Host-wc_admin" : "wc_admin";
}

async function reqMeta() {
  const h = await headers();
  return { ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, ua: h.get("user-agent")?.slice(0, 300) ?? null };
}

async function setCookie(token: string) {
  (await cookies()).set(adminCookieName(), token, {
    httpOnly: true, sameSite: "strict", path: "/", secure: (process.env.ADMIN_ORIGIN ?? "").startsWith("https://"), maxAge: ABSOLUTE_HOURS * 3600,
  });
}

export type LoginResult = { ok: true; mfa: "required" | "enroll" } | { ok: false; error: string };

/** Step 1: email + password. Creates a session that is NOT usable until MFA succeeds. */
export async function adminPasswordLogin(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const { ip, ua } = await reqMeta();
  const admin = await db.adminUser.findUnique({ where: { email } });
  const generic = { ok: false as const, error: "Incorrect email or password." };
  if (!admin) {
    await verifyPassword(password, DUMMY_HASH);
    await db.adminLoginEvent.create({ data: { emailAttempted: email.slice(0, 254), success: false, failureReason: "unknown_email", ipAddress: ip, userAgent: ua } });
    return generic;
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await db.adminLoginEvent.create({ data: { adminId: admin.id, emailAttempted: email, success: false, failureReason: "locked", ipAddress: ip, userAgent: ua } });
    return { ok: false, error: `Too many failed attempts. Try again after ${admin.lockedUntil.toISOString().slice(11, 16)} UTC.` };
  }
  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid || admin.status !== "ACTIVE") {
    const failures = admin.failedLoginCount + 1;
    await db.adminUser.update({ where: { id: admin.id }, data: { failedLoginCount: failures, ...(failures >= MAX_FAILURES ? { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginCount: 0 } : {}) } });
    await db.adminLoginEvent.create({ data: { adminId: admin.id, emailAttempted: email, success: false, failureReason: !valid ? "bad_password" : `status_${admin.status.toLowerCase()}`, ipAddress: ip, userAgent: ua } });
    return generic;
  }
  const token = newToken();
  await db.adminSession.create({ data: { tokenHash: sha256(token), adminId: admin.id, expiresAt: new Date(Date.now() + ABSOLUTE_HOURS * 3600_000), ipAddress: ip, userAgent: ua } });
  await setCookie(token);
  return { ok: true, mfa: admin.totpSecretEnc ? "required" : "enroll" };
}

async function currentSessionRow() {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (!token) return null;
  const s = await db.adminSession.findUnique({ where: { tokenHash: sha256(token) }, include: { admin: true } });
  if (!s || s.revokedAt || s.expiresAt < new Date()) return null;
  if (Date.now() - s.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await db.adminSession.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    return null;
  }
  if (s.admin.status !== "ACTIVE") return null;
  return s;
}

/** Step 2: TOTP code. Rejects replays of an already-used time-step. */
export async function adminVerifyMfa(code: string): Promise<{ ok: boolean; error?: string }> {
  const s = await currentSessionRow();
  if (!s) return { ok: false, error: "Your sign-in expired. Start again." };
  const { ip, ua } = await reqMeta();
  if (!s.admin.totpSecretEnc) return { ok: false, error: "Two-factor authentication is not set up for this account. Contact a Super Administrator." };
  const step = verifyTotp(decrypt(s.admin.totpSecretEnc), code.replace(/\s/g, ""));
  if (step === null || (s.admin.totpLastStep !== null && step <= s.admin.totpLastStep)) {
    const failures = s.admin.failedLoginCount + 1;
    await db.adminUser.update({ where: { id: s.adminId }, data: failures >= MAX_FAILURES ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failures } });
    if (failures >= MAX_FAILURES) await db.adminSession.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    await db.adminLoginEvent.create({ data: { adminId: s.adminId, emailAttempted: s.admin.email, success: false, failureReason: "bad_totp", ipAddress: ip, userAgent: ua } });
    return { ok: false, error: "Invalid or already used code." };
  }
  await db.$transaction([
    db.adminSession.update({ where: { id: s.id }, data: { mfaVerifiedAt: new Date(), lastSeenAt: new Date() } }),
    db.adminUser.update({ where: { id: s.adminId }, data: { totpLastStep: step, failedLoginCount: 0, lastLoginAt: new Date() } }),
    db.adminLoginEvent.create({ data: { adminId: s.adminId, emailAttempted: s.admin.email, success: true, ipAddress: ip, userAgent: ua } }),
  ]);
  await audit({ actorType: "ADMIN", adminId: s.adminId, action: "admin.login", ipAddress: ip, userAgent: ua });
  return { ok: true };
}

export interface CurrentAdmin { id: string; email: string; name: string; role: AdminRole; sessionId: string }

/** The fully authenticated (password + MFA) admin for this request, or null. */
export const getAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const s = await currentSessionRow();
  if (!s || !s.mfaVerifiedAt) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 60_000) await db.adminSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  return { id: s.admin.id, email: s.admin.email, name: s.admin.name, role: s.admin.role, sessionId: s.id };
});

export async function pendingMfaSession() {
  const s = await currentSessionRow();
  return s && !s.mfaVerifiedAt ? s : null;
}

export async function requireAdmin(perm?: Permission): Promise<CurrentAdmin> {
  const a = await getAdmin();
  if (!a) redirect("/login");
  if (perm && !can(a.role, perm)) redirect("/forbidden");
  return a;
}

/** For server actions: throws instead of redirecting when unauthorised. */
export async function assertAdmin(perm: Permission): Promise<CurrentAdmin> {
  const a = await getAdmin();
  if (!a) throw new Error("UNAUTHENTICATED");
  if (!can(a.role, perm)) {
    await audit({ actorType: "ADMIN", adminId: a.id, action: "admin.permission.denied", metadata: { perm } });
    throw new Error("FORBIDDEN");
  }
  return a;
}

export async function adminLogout() {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (token) await db.adminSession.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  (await cookies()).delete(adminCookieName());
}

export async function revokeAllAdminSessions(adminId: string) {
  await db.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
}
