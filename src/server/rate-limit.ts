import { db } from "@/server/db";

/**
 * Fixed-window rate limiter backed by MySQL / MariaDB (no Redis on shared hosting).
 * One atomic upsert per call. Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  // Atomic upsert: a new or expired bucket restarts at 1, otherwise the count grows.
  // Assignments run left to right, so both CASEs see the row's previous resetAt.
  const [, rows] = await db.$transaction([
    db.$executeRaw`
      INSERT INTO RateLimitBucket (\`key\`, count, resetAt)
      VALUES (${key}, 1, UTC_TIMESTAMP(3) + INTERVAL ${windowSeconds} SECOND)
      ON DUPLICATE KEY UPDATE
        count = CASE WHEN resetAt <= UTC_TIMESTAMP(3) THEN 1 ELSE count + 1 END,
        resetAt = CASE WHEN resetAt <= UTC_TIMESTAMP(3) THEN UTC_TIMESTAMP(3) + INTERVAL ${windowSeconds} SECOND ELSE resetAt END`,
    db.$queryRaw<Array<{ count: number }>>`SELECT count FROM RateLimitBucket WHERE \`key\` = ${key}`,
  ]);
  const allowed = Number(rows[0]?.count ?? Infinity) <= limit;
  // Record the first denial of each window (not every request of a flood).
  if (!allowed && Number(rows[0]?.count) === limit + 1) {
    const { recordSecurityEvent } = await import("@/server/security/events");
    await recordSecurityEvent("rate.limited", key, { severity: "warning", detail: `limit ${limit} per ${windowSeconds}s` });
  }
  return allowed;
}
