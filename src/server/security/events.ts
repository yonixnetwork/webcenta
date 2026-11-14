import { db } from "@/server/db";

/**
 * Security activity counters (Admin → Security → Activity). One row per type, source and hour:
 * a flood of failed sign-ins from one address is one row with a count, not one row per request.
 * Callers pass a source (IP address, account id or scope) and a short detail — never passwords,
 * tokens, cookies or request bodies. Recording never throws.
 */
export type SecurityEventType =
  | "admin.login.failed" | "admin.login.locked" | "admin.login.new-device" | "admin.stepup.failed" | "admin.permission.denied"
  | "user.login.failed" | "rate.limited" | "cron.unauthorized" | "request.blocked" | "import.suspicious" | "scan.failed";

const SEVERITY_RANK = { info: 0, warning: 1, critical: 2 } as const;

export async function recordSecurityEvent(type: SecurityEventType, source: string, opts: { severity?: keyof typeof SEVERITY_RANK; detail?: string } = {}) {
  try {
    const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
    const severity = opts.severity ?? "info";
    await db.$executeRaw`
      INSERT INTO SecurityEvent (id, type, severity, source, detail, hour, count, firstAt, lastAt)
      VALUES (UUID(), ${type}, ${severity}, ${source.slice(0, 191)}, ${opts.detail?.slice(0, 500) ?? null}, ${hour}, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE count = count + 1, lastAt = UTC_TIMESTAMP(3), detail = COALESCE(VALUES(detail), detail)`;
  } catch { /* monitoring must never break the request */ }
}
