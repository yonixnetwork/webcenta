"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/server/admin/auth";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rate-limit";
import { sectionById } from "@/server/settings/registry";
import { getSection, recordTest, saveSection, SettingsError } from "@/server/settings/store";
import { runTest } from "@/server/settings/testers";
import { applyPendingMigrations } from "@/server/setup/migrate";

export interface SettingsActionState { ok: boolean; message: string; stepUp?: boolean }

const APPLY_NOTE = {
  immediate: "It takes effect within a few seconds, without a restart.",
  restart: "Restart the application (hPanel → Node.js → Restart) for it to take effect.",
  redeploy: "Redeploy the application for it to take effect.",
} as const;

function fail(e: unknown): SettingsActionState {
  if (e instanceof SettingsError) return { ok: false, message: e.message };
  if (e instanceof Error && e.name === "StepUpError") return { ok: false, message: e.message, stepUp: true };
  if (e instanceof Error && e.message === "FORBIDDEN") return { ok: false, message: "Only a Super Administrator can change this section." };
  if (e instanceof Error && e.message === "UNAUTHENTICATED") return { ok: false, message: "Your session expired. Sign in again." };
  // Never log form data (it may contain secrets); only the error type.
  console.error("settings action failed:", e instanceof Error ? e.name : typeof e);
  return { ok: false, message: "Saving failed. Nothing was changed." };
}

/**
 * Form fields: "v:<key>" values, "b:<key>" marks a rendered checkbox, "s:<key>"
 * new secret values (empty = keep), "clear:<key>" removes a saved secret,
 * "enabled" + "b:__enabled" the section switch.
 */
export async function saveSettingsAction(sectionId: string, _s: SettingsActionState, f: FormData): Promise<SettingsActionState> {
  try {
    const def = sectionById(sectionId);
    if (!def || def.statusOnly) return { ok: false, message: "Unknown section." };
    const admin = await assertAdmin(def.permission);
    // Credentials (integrations, payments) and security settings need a fresh authenticator code.
    if (def.permission === "integrations.manage" || def.id === "security") {
      const { requireStepUp } = await import("@/server/admin/step-up");
      await requireStepUp(admin, String(f.get("stepUpCode") ?? ""), `settings.${def.id}`);
    }
    const values: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    const clearSecrets: string[] = [];
    for (const field of def.fields) {
      if (field.type === "secret") {
        const v = f.get(`s:${field.key}`);
        if (typeof v === "string" && v.trim()) secrets[field.key] = v;
        if (f.get(`clear:${field.key}`) === "on") clearSecrets.push(field.key);
      } else if (field.type === "boolean") {
        if (f.has(`b:${field.key}`)) values[field.key] = f.get(`v:${field.key}`) === "on" ? "on" : "off";
      } else {
        const v = f.get(`v:${field.key}`);
        if (typeof v === "string") values[field.key] = v;
      }
    }
    const enabled = def.toggle && f.has("b:__enabled") ? f.get("enabled") === "on" : undefined;
    const r = await saveSection(sectionId, { values, secrets, clearSecrets, enabled }, { adminId: admin.id });
    revalidatePath("/", "layout");
    if (!r.changed.length) return { ok: true, message: "No changes to save." };
    const next = r.def.testable && r.status.status !== "disabled" && r.status.status !== "missing" ? " Run “Test connection” to check it." : "";
    return { ok: true, message: `Saved (${r.changed.length} change${r.changed.length === 1 ? "" : "s"}). ${APPLY_NOTE[r.def.apply]}${next}` };
  } catch (e) {
    return fail(e);
  }
}

export async function testSettingsAction(sectionId: string): Promise<SettingsActionState> {
  try {
    const def = sectionById(sectionId);
    if (!def?.testable) return { ok: false, message: "This section has no connection test." };
    const admin = await assertAdmin(def.permission);
    if (!(await rateLimit(`settings-test:${admin.id}`, 20, 600))) return { ok: false, message: "Too many tests. Wait a few minutes." };
    const c = await getSection(sectionId);
    if (def.toggle && !c.enabled) return { ok: false, message: "Enable the section and save before testing." };
    const result = await runTest(sectionId, { adminEmail: admin.email });
    await recordTest(sectionId, result.ok, result.message);
    await audit({ actorType: "ADMIN", adminId: admin.id, action: "settings.test", targetType: "SystemSetting", targetId: `config.${sectionId}`, metadata: { section: sectionId, ok: result.ok } });
    revalidatePath("/", "layout");
    return result;
  } catch (e) {
    return fail(e);
  }
}


/** Applies pending database migrations (Super Administrators; audited). */
export async function applyMigrationsAction(): Promise<SettingsActionState> {
  try {
    const admin = await assertAdmin("integrations.manage");
    const r = await applyPendingMigrations();
    await audit({ actorType: "ADMIN", adminId: admin.id, action: "database.migrate", metadata: { applied: r.applied } });
    revalidatePath("/", "layout");
    return { ok: true, message: r.message };
  } catch (e) {
    if (e instanceof Error && !["FORBIDDEN", "UNAUTHENTICATED"].includes(e.message)) return { ok: false, message: e.message.slice(0, 400) };
    return fail(e);
  }
}
