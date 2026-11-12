import { createHmac, randomBytes } from "node:crypto";
import { db } from "@/server/db";

/**
 * Privacy-conscious visitor identifiers (ADR-0006).
 * hash = HMAC-SHA256(daily_salt, ip | user-agent | scope). Daily salts are random,
 * stored in SystemSetting and deleted by the maintenance job after 2 days, so
 * hashes cannot be recomputed or linked across days afterwards.
 */
const SALT_PREFIX = "analytics.salt.";
const memo = new Map<string, string>();

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function dailySalt(day = utcDay()): Promise<string> {
  const cached = memo.get(day);
  if (cached) return cached;
  const key = `${SALT_PREFIX}${day}`;
  // Insert-if-absent; concurrent creators converge on the stored value.
  await db.systemSetting.upsert({
    where: { key },
    create: { key, value: randomBytes(32).toString("base64"), description: "Ephemeral analytics salt (auto-deleted)" },
    update: {},
  });
  const row = await db.systemSetting.findUniqueOrThrow({ where: { key } });
  const salt = String(row.value);
  memo.clear();
  memo.set(day, salt);
  return salt;
}

export function visitorHash(salt: string, ip: string | null, userAgent: string | null, scope: string): string {
  return createHmac("sha256", salt).update(`${ip ?? "-"}|${userAgent ?? "-"}|${scope}`).digest("base64url").slice(0, 32);
}

export async function purgeOldSalts(keepDays = 2, now = new Date()): Promise<number> {
  const keep = new Set(Array.from({ length: keepDays }, (_, i) => `${SALT_PREFIX}${utcDay(new Date(now.getTime() - i * 86_400_000))}`));
  const rows = (await db.systemSetting.findMany({ select: { key: true } })).filter((r) => r.key.startsWith(SALT_PREFIX));
  const stale = rows.map((r) => r.key).filter((k) => !keep.has(k));
  if (stale.length) await db.systemSetting.deleteMany({ where: { key: { in: stale } } });
  memo.clear();
  return stale.length;
}

export type Device = "DESKTOP" | "MOBILE" | "TABLET" | "BOT" | "UNKNOWN";

export function deviceFromUserAgent(ua: string | null): Device {
  if (!ua) return "UNKNOWN";
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse|curl|wget|python-requests/i.test(ua)) return "BOT";
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "TABLET";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "MOBILE";
  return "DESKTOP";
}
