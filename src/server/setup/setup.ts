import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { migrationStatus } from "./migrate";

/**
 * First-time setup on the admin host (/setup). It exists only while BOTH hold:
 *   - SETUP_TOKEN (≥ 32 characters) is set in the hosting environment, and
 *   - no active Super Administrator exists.
 * Anything else answers 404, so it can never be used to take over an
 * installation that already has an owner. Every step requires the token.
 */
export const MIN_TOKEN = 32;

export function setupTokenConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SETUP_TOKEN ?? "").length >= MIN_TOKEN;
}

export function checkSetupToken(given: string, env: Record<string, string | undefined> = process.env): boolean {
  const expected = env.SETUP_TOKEN ?? "";
  if (expected.length < MIN_TOKEN) return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Active Super Administrators; null when the tables do not exist yet. */
export async function superAdminCount(): Promise<number | null> {
  try {
    return await db.adminUser.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  } catch {
    return null;
  }
}

/** Written when the first Super Administrator exists; from then on /setup never opens again. */
export const SETUP_LOCK_KEY = "setup.completed";

type Tx = Pick<typeof db, "systemSetting">;
export async function lockSetup(tx: Tx = db, reason = "owner account created"): Promise<void> {
  const value = { at: new Date().toISOString(), reason };
  await tx.systemSetting.upsert({ where: { key: SETUP_LOCK_KEY }, create: { key: SETUP_LOCK_KEY, value, description: "First-time setup is complete and permanently disabled" }, update: {} });
}

export async function setupLocked(): Promise<boolean> {
  try {
    return Boolean(await db.systemSetting.findUnique({ where: { key: SETUP_LOCK_KEY }, select: { key: true } }));
  } catch {
    return false; // no tables yet
  }
}

/**
 * Open only while SETUP_TOKEN is set, the setup lock has never been written and no
 * active Super Administrator exists. A Super Administrator found without the lock
 * (e.g. created with npm run admin:provision) writes it, so the page closes for good.
 */
export async function setupOpen(): Promise<boolean> {
  if (!setupTokenConfigured()) return false;
  if (await setupLocked()) return false;
  const supers = (await superAdminCount()) ?? 0;
  if (supers > 0) {
    await lockSetup(db, "Super Administrator found").catch(() => undefined);
    return false;
  }
  return true;
}

export interface SetupState {
  database: { ok: boolean; error?: string };
  migrations: { pending: string[]; failed: string[]; total: number; dirFound: boolean };
  baseData: { categories: number | null };
  pendingInvitation: boolean;
}

export async function setupState(): Promise<SetupState> {
  const s: SetupState = { database: { ok: false }, migrations: { pending: [], failed: [], total: 0, dirFound: false }, baseData: { categories: null }, pendingInvitation: false };
  try {
    const m = await migrationStatus();
    s.database.ok = true;
    s.migrations = {
      dirFound: Boolean(m.dir), total: m.migrations.length,
      pending: m.migrations.filter((x) => x.state === "pending").map((x) => x.name),
      failed: m.migrations.filter((x) => x.state === "failed" || x.state === "modified").map((x) => x.name),
    };
  } catch (e) {
    s.database.error = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
    return s;
  }
  try {
    s.baseData.categories = await db.category.count();
    s.pendingInvitation = (await db.adminInvitation.count({ where: { role: "SUPER_ADMIN", acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })) > 0;
  } catch { /* tables not created yet */ }
  return s;
}

/** Small in-memory limiter: setup runs before the rate-limit table exists. */
const g = globalThis as unknown as { __webcentaSetupAttempts?: Map<string, { n: number; reset: number }> };
export function setupAttemptAllowed(key: string, limit = 10, windowMs = 15 * 60_000, now = Date.now()): boolean {
  const m = (g.__webcentaSetupAttempts ??= new Map());
  const b = m.get(key);
  if (!b || b.reset < now) {
    m.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n++;
  return b.n <= limit;
}
