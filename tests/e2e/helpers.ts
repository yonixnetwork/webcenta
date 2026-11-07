import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import sharp from "sharp";
import type { APIRequestContext, Page } from "@playwright/test";

export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE = `http://localhost:${PORT}`;
export const ADMIN = `http://admin.localhost:${PORT}`;
export const CRON_SECRET = process.env.APP_CRON_SECRET!;

let client: pg.Client | null = null;
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (!client) {
    client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
    await client.connect();
  }
  return (await client.query(text, params)).rows as T[];
}
export async function closeDb() { await client?.end(); client = null; }

/** Latest URL from an email in the outbox (EMAIL_TRANSPORT=log records messages). */
export async function emailLink(to: string, template: string, contains = "http"): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const rows = await sql<{ text: string }>(`select text from "EmailMessage" where "to" = $1 and template = $2 order by "createdAt" desc limit 1`, [to.toLowerCase(), template]);
    const url = rows[0]?.text.match(/https?:\/\/\S+/g)?.find((u) => u.includes(contains));
    if (url) return url;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No ${template} email for ${to}`);
}

/** Independent RFC 6238 implementation (does not reuse app code). */
function b32(s: string) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0; const out: number[] = [];
  for (const ch of s.replace(/=+$/, "")) { val = (val << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totp(secret: string, offsetSteps = 0): string {
  const step = Math.floor(Date.now() / 30000) + offsetSteps;
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1e6).padStart(6, "0");
}

/**
 * A TOTP code for a step not used before with this secret (the app rejects replays).
 * Uses the current or next step; waits for the clock when both were already used.
 */
const usedSteps = new Map<string, number>();
export async function freshTotp(secret: string): Promise<string> {
  for (;;) {
    const now = Math.floor(Date.now() / 30000);
    const last = usedSteps.get(secret) ?? -1;
    const step = Math.max(now, last + 1);
    if (step <= now + 1) {
      usedSteps.set(secret, step);
      return totp(secret, step - now);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
export function markTotpUsed(secret: string) {
  usedSteps.set(secret, Math.max(usedSteps.get(secret) ?? -1, Math.floor(Date.now() / 30000)));
}

export async function setSite(host: string, patch: { mode?: string; verification?: string }) {
  const res = await fetch("http://127.0.0.1:4599/__control", { method: "POST", body: JSON.stringify({ host, ...patch }) });
  if (!res.ok) throw new Error("fixture control failed");
}

/** Runs the scheduler like Hostinger Cron would (optionally forcing specific jobs to run now). */
export async function runCron(request: APIRequestContext, forceJobs: string[] = []) {
  for (const type of forceJobs) await sql(`insert into "Job" (id, type, payload, "runAt") values (gen_random_uuid()::text, $1, '{}', now())`, [type]);
  const res = await request.post(`${BASE}/api/cron/tick`, { headers: { authorization: `Bearer ${CRON_SECRET}` }, timeout: 60_000 });
  if (res.status() !== 200) throw new Error(`cron tick failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export function provisionAdmin(email: string, extra: string[] = []): string {
  const out = execFileSync("npx", ["tsx", "scripts/admin-provision.ts", "--email", email, "--additional", ...extra], {
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL, DIRECT_URL: "", ADMIN_ORIGIN: ADMIN, FIELD_ENCRYPTION_KEY: process.env.APP_FIELD_ENCRYPTION_KEY, NODE_ENV: "development" },
    encoding: "utf8",
  });
  const url = out.match(/https?:\/\/\S+accept-invite\?token=\S+/)?.[0];
  if (!url) throw new Error(`provision failed: ${out}`);
  return url;
}

export async function pngBuffer(size = 256, color = "#4f46e5"): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer();
}

/** Registers + verifies a user through the real UI and email link. */
export async function registerUser(page: Page, email: string, name: string, password = "correct-horse-battery-staple") {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Account created").waitFor();
  await page.goto(await emailLink(email, "verify-email"));
  await page.waitForURL(/\/account/);
  return password;
}

export async function signIn(page: Page, email: string, password: string, next = "/account") {
  await page.goto(`${BASE}/signin?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === next.split("?")[0]);
}

export async function categoryId(slug: string) {
  return (await sql<{ id: string }>(`select id from "Category" where slug = $1`, [slug]))[0]!.id;
}
