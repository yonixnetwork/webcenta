import { createHmac, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { deriveKey, openSecret, sealSecret } from "./keys";
import { sectionById, SECTIONS, type FieldDef, type SectionDef } from "./registry";

/**
 * Runtime settings service. Each section of the registry is one SystemSetting
 * row ("config.<id>"); secret fields are sealed with AES-256-GCM (keys.ts) and
 * only ever decrypted here, on the server. Readers resolve each field as
 *   saved value → environment variable (field.env) → default.
 *
 * Every process keeps the rows in memory and re-checks one version row at most
 * every RECHECK_MS, so a change saved by an admin reaches every worker within a
 * few seconds without a restart. If the database is unreachable the service
 * falls back to environment variables and defaults instead of failing.
 */

export type Scalar = string | number | boolean;
export interface StoredTest { ok: boolean; message: string; at: string; fingerprint: string }
export interface StoredSection {
  enabled?: boolean;
  values: Record<string, Scalar>;
  /** Sealed secrets, "s1:…" (AAD = "config.<section>.<field>"). */
  secrets: Record<string, string>;
  test?: StoredTest;
}
export type Source = "saved" | "env" | "default" | "none";
export type Status = "disabled" | "missing" | "configured" | "connected" | "error";

const PREFIX = "config.";
const VERSION_KEY = "config.__version";
const RECHECK_MS = 5000;

interface Cache {
  version: string | null;
  checkedAt: number;
  rows: Map<string, StoredSection>;
  dbError: string | null;
  /** Bumped by invalidateSettings(); a load started before that is discarded. */
  gen: number;
  inflight: Promise<void> | null;
}
const g = globalThis as unknown as { __webcentaSettings?: Cache };
const cache = (): Cache => (g.__webcentaSettings ??= { version: null, checkedAt: 0, rows: new Map(), dbError: null, gen: 0, inflight: null });

const rowKey = (id: string) => PREFIX + id;
const aad = (section: string, field: string) => `${PREFIX}${section}.${field}`;

function asStored(v: unknown): StoredSection {
  const o = (v && typeof v === "object" ? v : {}) as Partial<StoredSection>;
  return { enabled: typeof o.enabled === "boolean" ? o.enabled : undefined, values: { ...(o.values ?? {}) }, secrets: { ...(o.secrets ?? {}) }, test: o.test };
}

async function refresh(c: Cache, gen: number): Promise<void> {
  if (!process.env.DATABASE_URL) {
    c.dbError = "DATABASE_URL is not set";
    return;
  }
  try {
    const v = await db.systemSetting.findUnique({ where: { key: VERSION_KEY }, select: { value: true } });
    const version = v ? String((v.value as { v?: string } | null)?.v ?? "") : "";
    if (version !== c.version || c.dbError) {
      // Prefix match in JS: the table is small, and LIKE depends on the connection collation.
      const rows = (await db.systemSetting.findMany({ select: { key: true, value: true } })).filter((r) => r.key.startsWith(PREFIX));
      if (gen !== c.gen) return; // invalidated meanwhile: a newer load wins
      c.rows = new Map(rows.filter((r) => r.key !== VERSION_KEY).map((r) => [r.key.slice(PREFIX.length), asStored(r.value)]));
      c.version = version;
      for (const fn of listeners) fn();
    }
    if (gen === c.gen) c.dbError = null;
  } catch (e) {
    // Keep the last good copy; fall back to env/defaults if there is none.
    if (gen === c.gen) c.dbError = e instanceof Error ? e.message.slice(0, 200) : "database error";
  }
}

async function load(): Promise<Cache> {
  const c = cache();
  if (Date.now() - c.checkedAt < RECHECK_MS) return c;
  if (!c.inflight) {
    const gen = c.gen;
    c.inflight = refresh(c, gen).finally(() => {
      if (gen === c.gen) c.checkedAt = Date.now();
      c.inflight = null;
    });
  }
  await c.inflight;
  // An invalidation during that load: load again with the new generation.
  return Date.now() - c.checkedAt < RECHECK_MS ? c : load();
}

const listeners = new Set<() => void>();
/** Called (in this process) whenever a newer settings version has been loaded. */
export function onSettingsChange(fn: () => void) {
  listeners.add(fn);
}

/** Forget the in-memory copy (tests, and after this process saves). */
export function invalidateSettings() {
  const c = cache();
  c.gen++;
  c.checkedAt = 0;
  c.version = null;
  c.inflight = null;
}

// --------------------------------------------------------------- resolution

function fromEnv(f: FieldDef, env: Record<string, string | undefined>): Scalar | undefined {
  const raw = f.env ? env[f.env] : undefined;
  if (raw === undefined || raw === "") return undefined;
  if (f.type === "number") return Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  if (f.type === "boolean") return raw === "true" || raw === "1";
  return raw;
}

export interface ResolvedSection {
  id: string;
  def: SectionDef;
  enabled: boolean;
  values: Record<string, Scalar | undefined>;
  sources: Record<string, Source>;
  /** Secret fields whose stored ciphertext cannot be decrypted (encryption key changed). */
  unreadable: string[];
  stored: StoredSection | undefined;
}

function resolve(def: SectionDef, stored: StoredSection | undefined, env: Record<string, string | undefined> = process.env): ResolvedSection {
  const values: Record<string, Scalar | undefined> = {};
  const sources: Record<string, Source> = {};
  const unreadable: string[] = [];
  for (const f of def.fields) {
    let v: Scalar | undefined;
    let s: Source = "none";
    if (f.type === "secret" && stored?.secrets[f.key]) {
      try {
        v = openSecret(stored.secrets[f.key]!, aad(def.id, f.key));
        s = "saved";
      } catch {
        unreadable.push(f.key);
      }
    } else if (f.type !== "secret" && stored && stored.values[f.key] !== undefined) {
      v = stored.values[f.key];
      s = "saved";
    }
    if (v === undefined) {
      const e = fromEnv(f, env);
      if (e !== undefined) [v, s] = [e, "env"];
      else if (f.default !== undefined) [v, s] = [f.default, "default"];
    }
    values[f.key] = v;
    sources[f.key] = s;
  }
  const enabled = !def.toggle ? true : stored?.enabled !== undefined ? stored.enabled : def.envEnabled ? def.envEnabled(env) : false;
  return { id: def.id, def, enabled, values, sources, unreadable, stored };
}

/** Typed view of one section for the code that uses it. */
export class Section {
  constructor(readonly r: ResolvedSection) {}
  get enabled() {
    return this.r.enabled;
  }
  /** Enabled and every required field present. */
  get ready() {
    return this.r.enabled && missingFields(this.r).length === 0;
  }
  str(k: string): string {
    const v = this.r.values[k];
    return v === undefined || v === null ? "" : String(v);
  }
  num(k: string): number {
    const v = Number(this.r.values[k]);
    return Number.isFinite(v) ? v : 0;
  }
  bool(k: string): boolean {
    return this.r.values[k] === true;
  }
  source(k: string): Source {
    return this.r.sources[k] ?? "none";
  }
}

export async function getSection(id: string): Promise<Section> {
  const def = sectionById(id);
  if (!def) throw new Error(`Unknown settings section "${id}"`);
  const c = await load();
  return new Section(resolve(def, c.rows.get(id)));
}

/** Synchronous read of the last loaded copy (falls back to env/defaults). For hot paths that cannot await. */
export function getSectionSync(id: string): Section {
  const def = sectionById(id);
  if (!def) throw new Error(`Unknown settings section "${id}"`);
  void load(); // refresh in the background when due
  return new Section(resolve(def, cache().rows.get(id)));
}

/**
 * Like getSection, but waits at most `ms` for the database; on a timeout it
 * answers from the last loaded copy (or env/defaults). For the request proxy.
 */
export async function getSectionWithin(id: string, ms: number): Promise<Section> {
  const def = sectionById(id);
  if (!def) throw new Error(`Unknown settings section "${id}"`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([load(), new Promise((r) => (timer = setTimeout(r, ms)))]);
  clearTimeout(timer);
  return new Section(resolve(def, cache().rows.get(id)));
}

export async function settingsDbError(): Promise<string | null> {
  return (await load()).dbError;
}

// --------------------------------------------------------------- status

function visible(def: SectionDef, f: FieldDef, values: Record<string, Scalar | undefined>) {
  return !f.when || values[f.when.key] === f.when.equals;
}

export function missingFields(r: ResolvedSection): string[] {
  const empty = (k: string) => r.values[k] === undefined || r.values[k] === "";
  const missing = r.def.fields.filter((f) => f.required && visible(r.def, f, r.values) && empty(f.key)).map((f) => f.key);
  // Alternatives (e.g. Apple: a signing key OR a ready-made JWT): report the first set's gaps.
  if (r.def.requireOneOf && !r.def.requireOneOf.some((set) => set.every((k) => !empty(k)))) {
    for (const k of r.def.requireOneOf[0]!) if (empty(k) && !missing.includes(k)) missing.push(k);
  }
  return missing;
}

/**
 * Keyed hash of everything a connection test depends on. A stored test result
 * only counts while the configuration is unchanged. HMAC (not a plain hash) so
 * the stored value reveals nothing about secrets.
 */
export function fingerprint(r: ResolvedSection): string {
  const data = JSON.stringify([r.enabled, r.def.fields.map((f) => [f.key, r.values[f.key] ?? null])]);
  return createHmac("sha256", deriveKey("settings-fingerprint")).update(data).digest("hex").slice(0, 32);
}

export interface SectionStatus { status: Status; detail: string; missing: string[]; test?: StoredTest }

export function statusOf(r: ResolvedSection): SectionStatus {
  const missing = missingFields(r);
  const test = r.stored?.test && r.stored.test.fingerprint === fingerprint(r) ? r.stored.test : undefined;
  if (r.def.toggle && !r.enabled) return { status: "disabled", detail: "Disabled", missing, test };
  if (r.unreadable.length) return { status: "error", detail: `Saved secret(s) can no longer be decrypted (${r.unreadable.join(", ")}): the encryption key changed. Enter them again.`, missing, test };
  if (missing.length) return { status: "missing", detail: `Missing: ${missing.map((k) => r.def.fields.find((f) => f.key === k)?.label ?? k).join(", ")}`, missing, test };
  if (test) return test.ok ? { status: "connected", detail: test.message, missing, test } : { status: "error", detail: test.message, missing, test };
  return { status: "configured", detail: r.def.testable ? "Configured, not tested since the last change" : "Configured", missing, test };
}

export async function allSections(): Promise<Array<{ section: Section; status: SectionStatus }>> {
  const c = await load();
  return SECTIONS.map((def) => {
    const r = resolve(def, c.rows.get(def.id));
    return { section: new Section(r), status: statusOf(r) };
  });
}

/** What an admin form may show: never secret values, only whether one is set and where from. */
export interface PublicField {
  key: string;
  /** The SAVED value (empty when the field follows env/default). Always empty for secrets. */
  saved: string;
  /** Effective value for display; for secrets only a masked hint. */
  effective: string;
  secretSet: boolean;
  source: Source;
}
export function publicView(s: Section): PublicField[] {
  return s.r.def.fields.map((f) => {
    const v = s.r.values[f.key];
    const src = s.r.sources[f.key] ?? "none";
    if (f.type === "secret") {
      const set = v !== undefined && v !== "";
      return { key: f.key, saved: "", effective: set ? maskSecret(String(v), !/password/i.test(f.key)) : "", secretSet: set, source: src };
    }
    const str = v === undefined ? "" : String(v);
    return { key: f.key, saved: src === "saved" ? str : "", effective: str, secretSet: false, source: src };
  });
}

/**
 * Masked hint for a saved secret. Long API keys show their last 4 characters so
 * an admin can tell which key is stored; passwords and short secrets show nothing.
 */
export function maskSecret(v: string, revealTail = true): string {
  return revealTail && v.length >= 20 ? `••••••••${v.slice(-4)}` : "••••••••";
}

// --------------------------------------------------------------- writes

export class SettingsError extends Error {}

function parseField(f: FieldDef, raw: string): Scalar {
  if (f.type === "boolean") return raw === "on" || raw === "true" || raw === "1";
  if (f.type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new SettingsError(`${f.label}: enter a number.`);
    if (f.min !== undefined && n < f.min) throw new SettingsError(`${f.label}: at least ${f.min}.`);
    if (f.max !== undefined && n > f.max) throw new SettingsError(`${f.label}: at most ${f.max}.`);
    return n;
  }
  if (f.max !== undefined && raw.length > f.max) throw new SettingsError(`${f.label}: at most ${f.max} characters.`);
  if (raw.length > 10_000) throw new SettingsError(`${f.label}: too long.`);
  if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) throw new SettingsError(`${f.label}: enter an email address.`);
  if (f.type === "url" && !/^https?:\/\/\S+$/.test(raw)) throw new SettingsError(`${f.label}: enter a full address starting with https://.`);
  if (f.type === "color" && !/^#[0-9a-fA-F]{6}$/.test(raw)) throw new SettingsError(`${f.label}: a colour like #4f46e5.`);
  if (f.type === "select" && !f.options?.some((o) => o.value === raw)) throw new SettingsError(`${f.label}: choose one of the options.`);
  if (f.pattern && !new RegExp(f.pattern.source).test(raw)) throw new SettingsError(`${f.label}: ${f.pattern.message}`);
  const invalid = f.validate?.(raw);
  if (invalid) throw new SettingsError(`${f.label}: ${invalid}`);
  return raw;
}

export interface SaveInput {
  /** Raw form values. Absent keys are left unchanged; "" clears a non-secret value (back to env/default). */
  values: Record<string, string | undefined>;
  /** New secret values; empty/absent = keep the saved secret. */
  secrets?: Record<string, string | undefined>;
  /** Secret fields to delete. */
  clearSecrets?: string[];
  enabled?: boolean;
}

export interface SaveResult { changed: string[]; status: SectionStatus; def: SectionDef }

/**
 * Validates and saves one section, bumps the version so every process reloads,
 * and audits the names of the changed fields (never their values).
 */
export async function saveSection(id: string, input: SaveInput, actor: { adminId: string; ip?: string | null }): Promise<SaveResult> {
  const def = sectionById(id);
  if (!def || def.statusOnly) throw new SettingsError("This section cannot be edited.");
  const prev = asStored((await db.systemSetting.findUnique({ where: { key: rowKey(id) } }))?.value);
  const next: StoredSection = { enabled: prev.enabled, values: { ...prev.values }, secrets: { ...prev.secrets } };
  const changed: string[] = [];

  for (const f of def.fields) {
    if (f.type === "secret") {
      const raw = input.secrets?.[f.key]?.trim();
      if (raw) {
        if (/\s/.test(raw) && !/password/i.test(f.key) && !f.multiline) throw new SettingsError(`${f.label}: must not contain spaces.`);
        if (raw.length > 8000) throw new SettingsError(`${f.label}: too long.`);
        if (f.pattern && !new RegExp(f.pattern.source).test(raw)) throw new SettingsError(`${f.label}: ${f.pattern.message}`);
        const invalid = f.validate?.(raw);
        if (invalid) throw new SettingsError(`${f.label}: ${invalid}`);
        next.secrets[f.key] = sealSecret(raw, aad(id, f.key));
        changed.push(`${f.key} (replaced)`);
      } else if (input.clearSecrets?.includes(f.key) && next.secrets[f.key]) {
        delete next.secrets[f.key];
        changed.push(`${f.key} (removed)`);
      }
      continue;
    }
    // Checkboxes are absent from a form when unchecked: the form marks which booleans it rendered.
    const raw = input.values[f.key];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed === "" && f.type !== "boolean") {
      if (next.values[f.key] !== undefined) {
        delete next.values[f.key];
        changed.push(f.key);
      }
      continue;
    }
    const v = parseField(f, trimmed);
    // An unchanged checkbox that was never saved keeps following its env/default value.
    if ((f.type === "boolean" || f.type === "select") && next.values[f.key] === undefined && resolve(def, next).values[f.key] === v) continue;
    if (next.values[f.key] !== v) {
      next.values[f.key] = v;
      changed.push(f.key);
    }
  }
  if (def.toggle && input.enabled !== undefined && input.enabled !== resolve(def, prev).enabled) {
    next.enabled = input.enabled;
    changed.push(input.enabled ? "enabled" : "disabled");
  } else if (def.toggle && input.enabled !== undefined) {
    next.enabled = input.enabled;
  }

  const r = resolve(def, next);
  const missing = missingFields(r);
  if (def.toggle && r.enabled && missing.length) {
    throw new SettingsError(`To enable ${def.title}, fill in: ${missing.map((k) => def.fields.find((f) => f.key === k)?.label ?? k).join(", ")}. You can save it disabled first.`);
  }
  // Keep a still-valid test result (e.g. a toggle-only change back and forth).
  if (prev.test) next.test = prev.test;

  if (changed.length) {
    await db.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: rowKey(id) },
        create: { key: rowKey(id), value: next as unknown as Prisma.InputJsonValue, updatedByAdminId: actor.adminId, description: `Admin settings: ${def.title}` },
        update: { value: next as unknown as Prisma.InputJsonValue, updatedByAdminId: actor.adminId },
      });
      await bumpVersion(tx);
      await audit({ actorType: "ADMIN", adminId: actor.adminId, action: "settings.update", targetType: "SystemSetting", targetId: rowKey(id), metadata: { section: id, changed }, ipAddress: actor.ip ?? null }, tx);
    });
    invalidateSettings();
  }
  return { changed, status: statusOf(r), def };
}

async function bumpVersion(tx: Prisma.TransactionClient) {
  const v = { v: randomUUID() };
  await tx.systemSetting.upsert({ where: { key: VERSION_KEY }, create: { key: VERSION_KEY, value: v, description: "Changes whenever admin settings change" }, update: { value: v } });
}

/** Stores a connection-test result against the configuration it was run with. */
export async function recordTest(id: string, ok: boolean, message: string): Promise<void> {
  const def = sectionById(id);
  if (!def) return;
  const row = await db.systemSetting.findUnique({ where: { key: rowKey(id) } });
  const stored = asStored(row?.value);
  const r = resolve(def, stored);
  stored.test = { ok, message: message.slice(0, 300), at: new Date().toISOString(), fingerprint: fingerprint(r) };
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({ where: { key: rowKey(id) }, create: { key: rowKey(id), value: stored as unknown as Prisma.InputJsonValue, description: `Admin settings: ${def.title}` }, update: { value: stored as unknown as Prisma.InputJsonValue } });
    await bumpVersion(tx);
  });
  invalidateSettings();
}

/** For unit tests: resolve a section from a stored object and an environment. */
export const __test = { resolve, asStored, parseField };
