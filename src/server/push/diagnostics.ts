import { db } from "@/server/db";

/**
 * Admin → Push notifications → Delivery report. Counts come from PushDelivery (one row per
 * attempt) and the subscriptions themselves. "Accepted" = the push service answered 201; the
 * server cannot know whether the device displayed the notification or the user saw it.
 */
export async function pushDiagnostics(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [byOutcome, byCategory, byPlatform, lastAccepted, lastAttempt, subs, subsByPlatform, iosStandalone, unhealthy, optedOut, activeUsers, usersWithPush, notifications, recentFailures] = await Promise.all([
    db.pushDelivery.groupBy({ by: ["outcome"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.pushDelivery.groupBy({ by: ["category"], where: { createdAt: { gte: since }, outcome: { not: "ACCEPTED" } }, _count: { _all: true } }),
    db.pushDelivery.groupBy({ by: ["platform", "outcome"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.pushDelivery.findFirst({ where: { outcome: "ACCEPTED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.pushDelivery.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.pushSubscription.count(),
    db.pushSubscription.groupBy({ by: ["platform"], _count: { _all: true } }),
    db.pushSubscription.count({ where: { platform: "ios", standalone: true } }),
    db.pushSubscription.count({ where: { failureCount: { gte: 5 } } }),
    db.pushSubscription.count({ where: { user: { OR: [{ pushNotifications: false }, { status: { not: "ACTIVE" } }] } } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { status: "ACTIVE", pushSubscriptions: { some: {} } } }),
    db.notification.count({ where: { createdAt: { gte: since } } }),
    db.pushSubscription.findMany({ where: { lastFailureAt: { not: null } }, orderBy: { lastFailureAt: "desc" }, take: 15, select: { id: true, platform: true, standalone: true, userId: true, failureCount: true, lastStatus: true, lastError: true, lastFailureAt: true, lastSuccessAt: true, lastSyncedAt: true } }),
  ]);
  const byKindRows = await db.pushDelivery.groupBy({ by: ["kind", "outcome"], where: { createdAt: { gte: since } }, _count: { _all: true } });
  const kinds = new Map<string, { accepted: number; failed: number }>();
  for (const r of byKindRows) {
    const v = kinds.get(r.kind) ?? { accepted: 0, failed: 0 };
    if (r.outcome === "ACCEPTED") v.accepted += r._count._all; else v.failed += r._count._all;
    kinds.set(r.kind, v);
  }
  const count = (o: string) => byOutcome.find((x) => x.outcome === o)?._count._all ?? 0;
  const platforms = new Map<string, { accepted: number; failed: number; expired: number }>();
  for (const p of byPlatform) {
    const k = p.platform ?? "unknown";
    const v = platforms.get(k) ?? { accepted: 0, failed: 0, expired: 0 };
    if (p.outcome === "ACCEPTED") v.accepted += p._count._all; else if (p.outcome === "EXPIRED") v.expired += p._count._all; else v.failed += p._count._all;
    platforms.set(k, v);
  }
  return {
    days,
    notificationsCreated: notifications,
    attempts: count("ACCEPTED") + count("FAILED") + count("EXPIRED"),
    accepted: count("ACCEPTED"),
    failed: count("FAILED"),
    expired: count("EXPIRED"),
    categories: byCategory.map((c) => ({ category: c.category ?? "other", count: c._count._all })).sort((a, b) => b.count - a.count),
    platforms: [...platforms.entries()].map(([platform, v]) => ({ platform, ...v })),
    /** CAMPAIGN (promotional announcement), EVENT (user notification), REMINDER, TEST (admin test). */
    kinds: [...kinds.entries()].map(([kind, v]) => ({ kind, ...v })),
    lastAcceptedAt: lastAccepted?.createdAt ?? null,
    lastAttemptAt: lastAttempt?.createdAt ?? null,
    subscriptions: subs,
    subscriptionsByPlatform: subsByPlatform.map((p) => ({ platform: p.platform ?? "unknown", count: p._count._all })),
    iosStandalone,
    notEligible: unhealthy + optedOut,
    unhealthy,
    optedOut,
    usersWithoutPush: Math.max(0, activeUsers - usersWithPush),
    activeUsers,
    recentFailures,
  };
}
