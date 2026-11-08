import type { AdminRole } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";
import { encrypt, decrypt, hashPassword, newToken, newTotpSecret, sha256, verifyTotp } from "./crypto";
import { adminOrigin } from "@/lib/hosts";

export const INVITE_HOURS = 72;

export function inviteUrl(token: string) {
  return `${adminOrigin()}/accept-invite?token=${token}`;
}

/** Creates an invitation. Returns the raw token (shown/emailed once; only its hash is stored). */
export async function createInvitation(email: string, role: AdminRole, invitedById: string | null) {
  const token = newToken();
  const normalized = email.trim().toLowerCase();
  if (await db.adminUser.findUnique({ where: { email: normalized } })) throw new Error("An administrator with this email already exists");
  await db.adminInvitation.updateMany({ where: { email: normalized, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.adminInvitation.create({ data: { email: normalized, role, tokenHash: sha256(token), invitedById, expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000) } });
  await audit({ actorType: invitedById ? "ADMIN" : "SYSTEM", adminId: invitedById, action: "admin.invite.create", metadata: { email: normalized, role } });
  if (invitedById) {
    const m = actionEmail({ title: "You have been invited to Webcenta Admin", intro: `You were invited as ${role.replace(/_/g, " ").toLowerCase()}. You will set a password and two-factor authentication.`, actionLabel: "Accept invitation", url: inviteUrl(token), outro: `This link expires in ${INVITE_HOURS} hours and can be used once.` });
    await sendEmail({ to: normalized, subject: "Webcenta Admin invitation", template: "admin-invite", ...m });
  }
  return token;
}

export async function findValidInvitation(token: string) {
  const inv = await db.adminInvitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

/** Generates (once) and returns the TOTP secret the invitee must enrol. */
export async function invitationTotpSecret(invitationId: string): Promise<string> {
  const inv = await db.adminInvitation.findUniqueOrThrow({ where: { id: invitationId } });
  if (inv.pendingTotpEnc) return decrypt(inv.pendingTotpEnc);
  const secret = newTotpSecret();
  await db.adminInvitation.update({ where: { id: invitationId }, data: { pendingTotpEnc: encrypt(secret) } });
  return secret;
}

export async function acceptInvitation(token: string, input: { name: string; password: string; totp: string }) {
  const inv = await findValidInvitation(token);
  if (!inv || !inv.pendingTotpEnc) throw new Error("This invitation is invalid or has expired.");
  if (input.password.length < 12) throw new Error("Use at least 12 characters for the password.");
  if (!input.name.trim()) throw new Error("Enter your name.");
  const secret = decrypt(inv.pendingTotpEnc);
  const step = verifyTotp(secret, input.totp.replace(/\s/g, ""));
  if (step === null) throw new Error("The authenticator code is not valid. Check the time on your device and try again.");
  const admin = await db.$transaction(async (tx) => {
    const a = await tx.adminUser.create({
      data: { email: inv.email, name: input.name.trim().slice(0, 80), role: inv.role, passwordHash: await hashPassword(input.password), totpSecretEnc: inv.pendingTotpEnc, totpEnabledAt: new Date(), totpLastStep: step, invitedById: inv.invitedById, passwordChangedAt: new Date() },
    });
    await tx.adminInvitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date(), pendingTotpEnc: null } });
    return a;
  });
  await audit({ actorType: "ADMIN", adminId: admin.id, action: "admin.invite.accept", metadata: { role: admin.role } });
  return admin;
}
