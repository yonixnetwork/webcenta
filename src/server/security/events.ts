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

type Severity = "info" | "warning" | "critical";

export async function recordSecurityEvent(type: SecurityEventType, source: string, opts: { severity?: Severity; detail?: string } = {}) {
  try {
    const hour = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
    const severity = opts.severity ?? "info";
    await db.$executeRaw`
      INSERT INTO SecurityEvent (id, type, severity, source, detail, hour, count, firstAt, lastAt)
      VALUES (UUID(), ${type}, ${severity}, ${source.slice(0, 191)}, ${opts.detail?.slice(0, 500) ?? null}, ${hour}, 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE count = count + 1, lastAt = UTC_TIMESTAMP(3), detail = COALESCE(VALUES(detail), detail)`;
  } catch { /* monitoring must never break the request */ }
}

/**
 * When a row becomes worth an alert. Thresholds are per source and hour, so normal use (a
 * mistyped password, one rate-limited script) does not email anyone.
 */
const ALERT_AT: Partial<Record<SecurityEventType, number>> = {
  "admin.login.locked": 1,
  "admin.login.new-device": 1,
  "admin.stepup.failed": 3,
  "admin.login.failed": 10,
  "admin.permission.denied": 5,
  "import.suspicious": 1,
  "cron.unauthorized": 10,
  "user.login.failed": 50,
  "rate.limited": 20,
};

/** Scheduled job "security.alerts": emails administrators about new meaningful events (each row once). */
export async function sendSecurityAlerts(): Promise<{ alerted: number }> {
  const since = new Date(Date.now() - 2 * 3600_000);
  const rows = await db.securityEvent.findMany({ where: { hour: { gte: since }, alertedAt: null }, orderBy: { lastAt: "asc" }, take: 500 });
  const due = rows.filter((r) => r.count >= (ALERT_AT[r.type as SecurityEventType] ?? Infinity));
  if (!due.length) return { alerted: 0 };
  const lines = due.map((r) => `${r.severity.toUpperCase()} · ${r.type} · ${r.count}× from ${r.source}${r.detail ? ` (${r.detail})` : ""} · last ${r.lastAt.toISOString().slice(11, 16)} UTC`);
  const { notifyAdmins } = await import("@/server/scanner/monitor");
  await notifyAdmins(`Security activity: ${due.length} event${due.length === 1 ? "" : "s"} need attention`, lines.join("\n").slice(0, 3000), "/security");
  await db.securityEvent.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { alertedAt: new Date() } });
  return { alerted: due.length };
}
