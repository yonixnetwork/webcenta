"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { createInvitation, inviteUrl } from "@/server/admin/invitations";
import { invalidateSettings } from "@/server/settings/store";
import { seedBase } from "@/server/setup/base-seed";
import { applyPendingMigrations } from "@/server/setup/migrate";
import { checkSetupToken, setupAttemptAllowed, setupOpen } from "@/server/setup/setup";

export interface SetupActionState { ok: boolean; message: string; link?: string }

async function guard(f: FormData): Promise<string | null> {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
  if (!setupAttemptAllowed(`ip:${ip}`) || !setupAttemptAllowed("global", 60, 60 * 60_000)) return "Too many attempts. Wait 15 minutes.";
  if (!(await setupOpen())) return "Setup is closed.";
  if (!checkSetupToken(String(f.get("token") ?? ""))) {
    await audit({ actorType: "SYSTEM", action: "setup.token.rejected", metadata: { ip } }).catch(() => undefined);
    return "The setup token is not correct.";
  }
  return null;
}

/** Step 1: create the tables (pending migrations) and the base data. */
export async function prepareDatabaseAction(_s: SetupActionState, f: FormData): Promise<SetupActionState> {
  const denied = await guard(f);
  if (denied) return { ok: false, message: denied };
  try {
    const m = await applyPendingMigrations();
    const log: string[] = [];
    await seedBase(db, (x) => log.push(x));
    invalidateSettings();
    await audit({ actorType: "SYSTEM", action: "setup.database.prepare", metadata: { applied: m.applied } }).catch(() => undefined);
    return { ok: true, message: `${m.message} Base data: ${log.join("; ")}.` };
  } catch (e) {
    return { ok: false, message: (e instanceof Error ? e.message : String(e)).slice(0, 400) };
  }
}

/** Step 2: a single-use invitation for the first Super Administrator. */
export async function createOwnerInviteAction(_s: SetupActionState, f: FormData): Promise<SetupActionState> {
  const denied = await guard(f);
  if (denied) return { ok: false, message: denied };
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(f.get("email"));
  if (!email.success) return { ok: false, message: "Enter a valid email address." };
  try {
    const token = await createInvitation(email.data, "SUPER_ADMIN", null);
    await audit({ actorType: "SYSTEM", action: "setup.owner.invite", metadata: { email: email.data } });
    return { ok: true, message: "Invitation created. Open the link below (valid 72 hours, single use) to set your password and two-factor authentication. Keep it private: anyone with the link can claim the account.", link: inviteUrl(token) };
  } catch (e) {
    return { ok: false, message: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
