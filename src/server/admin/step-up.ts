import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { decrypt, verifyTotp } from "./crypto";
import { LOCK_MINUTES, MAX_FAILURES, type CurrentAdmin } from "./auth";
import { recordSecurityEvent } from "@/server/security/events";

/**
 * Re-authentication for sensitive administrator actions: creating or changing administrators,
 * MFA resets, security and integration settings (credentials, payment), removing listings and
 * bulk rejection, archiving or suspension. The administrator confirms with a fresh authenticator
 * code; a successful confirmation (or the sign-in itself) is valid for STEP_UP_MINUTES on this
 * session only. Wrong codes count towards the account lockout like failed sign-ins.
 */
export const STEP_UP_MINUTES = 10;
export const STEP_UP_FIELD = "stepUpCode";

export class StepUpError extends Error {
  constructor(message = "Confirm this action with a code from your authenticator app.") { super(message); this.name = "StepUpError"; }
}

export async function stepUpFresh(sessionId: string): Promise<boolean> {
  const s = await db.adminSession.findUnique({ where: { id: sessionId }, select: { stepUpAt: true } });
  return Boolean(s?.stepUpAt && Date.now() - s.stepUpAt.getTime() < STEP_UP_MINUTES * 60_000);
}

/** Throws StepUpError unless the session was confirmed recently or `code` is a valid, unused TOTP code. */
export async function requireStepUp(admin: CurrentAdmin, code: string | null | undefined, action: string): Promise<void> {
  if (await stepUpFresh(admin.sessionId)) return;
  const clean = (code ?? "").replace(/\s/g, "");
  if (!clean) throw new StepUpError();
  const a = await db.adminUser.findUniqueOrThrow({ where: { id: admin.id }, select: { totpSecretEnc: true, totpLastStep: true, failedLoginCount: true } });
  const step = a.totpSecretEnc ? verifyTotp(decrypt(a.totpSecretEnc), clean) : null;
  if (step === null || (a.totpLastStep !== null && step <= a.totpLastStep)) {
    const failures = a.failedLoginCount + 1;
    await db.adminUser.update({ where: { id: admin.id }, data: failures >= MAX_FAILURES ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLoginCount: failures } });
    if (failures >= MAX_FAILURES) await db.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordSecurityEvent("admin.stepup.failed", admin.id, { severity: "warning", detail: `action ${action}` });
    throw new StepUpError("That authenticator code is wrong or was already used.");
  }
  await db.$transaction([
    db.adminUser.update({ where: { id: admin.id }, data: { totpLastStep: step, failedLoginCount: 0 } }),
    db.adminSession.update({ where: { id: admin.sessionId }, data: { stepUpAt: new Date() } }),
  ]);
  await audit({ actorType: "ADMIN", adminId: admin.id, action: "admin.step-up", metadata: { for: action } });
}
