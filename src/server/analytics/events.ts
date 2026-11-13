import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { clientIp, normalizeCountry, networkSettings } from "@/server/viewer";
import { dailySalt, deviceFromUserAgent, visitorHash } from "./visitor";

/** Repeat views/clicks by the same visitor within this window are not counted again. */
export const DEDUPE_MINUTES = 30;

export function referrerHost(h: Headers): string | null {
  try {
    const ref = h.get("referer");
    if (!ref) return null;
    const host = new URL(ref).hostname.toLowerCase();
    const own = new URL(env().PUBLIC_ORIGIN).hostname;
    return host === own ? null : host.slice(0, 253);
  } catch {
    return null;
  }
}

/**
 * Inserts a listing event unless the visitor already produced the same event
 * for that listing within DEDUPE_MINUTES. Bots are never recorded.
 * Returns true when a new event was stored.
 */
export async function recordListingEvent(listingId: string, type: "VIEW" | "OUTBOUND_CLICK", h: Headers, opts: { surface?: string; referrer?: string | null } = {}): Promise<boolean> {
  const e = await networkSettings();
  const ua = h.get("user-agent");
  const device = deviceFromUserAgent(ua);
  if (device === "BOT") return false;
  const hash = visitorHash(await dailySalt(), clientIp(h, e.trustedProxyHops), ua, listingId);
  const country = normalizeCountry(h.get(e.geoCountryHeader));
  const n = await db.$executeRaw`
    INSERT INTO ListingEvent (listingId, type, visitorHash, countryCode, device, referrerHost, surface, occurredAt)
    SELECT ${listingId}, ${type}, ${hash}, ${country}, ${device}, ${opts.referrer ?? null}, ${opts.surface ?? null}, UTC_TIMESTAMP(3)
    FROM DUAL
    WHERE NOT EXISTS (
      SELECT 1 FROM ListingEvent WHERE listingId = ${listingId} AND type = ${type}
        AND visitorHash = ${hash} AND occurredAt > UTC_TIMESTAMP(3) - INTERVAL ${DEDUPE_MINUTES} MINUTE
    )`;
  return n > 0;
}

/**
 * True when the signed-in user is a member of the organisation that publishes the listing: their
 * own views and clicks (previews, checks) are not counted as visitors.
 */
export async function isListingTeam(listingId: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { developerId: true } });
  if (!l?.developerId) return false;
  return Boolean(await db.developerMember.findUnique({ where: { orgId_userId: { orgId: l.developerId, userId } }, select: { userId: true } }));
}

/** One search impression per listing per visitor per day. */
export async function recordSearchImpressions(listingIds: string[], h: Headers): Promise<number> {
  if (listingIds.length === 0) return 0;
  const e = await networkSettings();
  const ua = h.get("user-agent");
  const device = deviceFromUserAgent(ua);
  if (device === "BOT") return 0;
  const salt = await dailySalt();
  const ip = clientIp(h, e.trustedProxyHops);
  const country = normalizeCountry(h.get(e.geoCountryHeader));
  const rows = listingIds.slice(0, 50).map((id) => Prisma.sql`SELECT ${id} AS id, ${visitorHash(salt, ip, ua, id)} AS hash`);
  return db.$executeRaw`
    INSERT INTO ListingEvent (listingId, type, visitorHash, countryCode, device, surface, occurredAt)
    SELECT v.id, 'SEARCH_IMPRESSION', v.hash, ${country}, ${device}, 'search', UTC_TIMESTAMP(3)
    FROM (${Prisma.join(rows, " UNION ALL ")}) AS v
    WHERE NOT EXISTS (
      SELECT 1 FROM ListingEvent le WHERE le.listingId = v.id AND le.type = 'SEARCH_IMPRESSION'
        AND le.visitorHash = v.hash AND le.occurredAt >= UTC_DATE()
    )`;
}

/** Rejects cross-site requests to beacon endpoints (prevents third-party stat inflation). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
