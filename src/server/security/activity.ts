import { db } from "@/server/db";

/** Admin → Security → Activity: what happened in the last `hours`, without secrets. */
export async function securityActivity(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const [byType, recent, lockedAdmins, userFailed, adminFailed, sessions, configChanges, sensitive] = await Promise.all([
    db.securityEvent.groupBy({ by: ["type"], where: { hour: { gte: since } }, _sum: { count: true }, _count: { _all: true } }),
    db.securityEvent.findMany({ where: { hour: { gte: since }, severity: { in: ["warning", "critical"] } }, orderBy: { lastAt: "desc" }, take: 30 }),
    db.adminUser.findMany({ where: { lockedUntil: { gt: new Date() } }, select: { id: true, email: true, lockedUntil: true } }),
    db.authEvent.count({ where: { type: "LOGIN_FAILED", createdAt: { gte: since } } }),
    db.adminLoginEvent.count({ where: { success: false, createdAt: { gte: since } } }),
    db.adminSession.findMany({ where: { revokedAt: null, mfaVerifiedAt: { not: null }, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 30, select: { id: true, adminId: true, ipAddress: true, userAgent: true, lastSeenAt: true, createdAt: true, admin: { select: { email: true } } } }),
    db.auditLog.findMany({ where: { action: { in: ["settings.update", "security.policy.update", "security.blocklist.update"] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, createdAt: true, adminId: true, targetId: true, metadata: true } }),
    db.auditLog.findMany({
      where: { createdAt: { gte: since }, OR: [{ action: { startsWith: "admin.role" } }, { action: { startsWith: "admin.status" } }, { action: "admin.invite.create" }, { action: { startsWith: "imports.bulk-" } }, { action: { startsWith: "submissions.bulk-" } }, { action: "listing.removed" }, { action: "listing.suspended" }, { action: "push.send" }] },
      orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true, adminId: true, metadata: true },
    }),
  ]);
  return {
    hours,
    byType: byType.map((t) => ({ type: t.type, events: t._sum.count ?? 0, sources: t._count._all })).sort((a, b) => b.events - a.events),
    recent, lockedAdmins, userFailed, adminFailed, sessions, configChanges, sensitive,
  };
}
