import { db } from "@/server/db";
import { purgeOldSalts } from "@/server/analytics/visitor";
import { deliverPending } from "@/server/email/send";
import { enqueueDueScans, monitorListing } from "@/server/scanner/monitor";
import { processSubmission } from "@/server/listings/workflow";
import { rollupDay } from "@/server/analytics/stats";
import { recomputeScores } from "@/server/analytics/ranking";
import { reconcileSearchDocuments } from "@/server/search/document";
import { pingIndexNow } from "@/server/settings/site";

export type JobHandler = (payload: unknown) => Promise<void>;

/** Registered job handlers. Later phases add scans, roll-ups, emails, etc. */
export const handlers: Record<string, JobHandler> = {
  /** Removes expired ephemeral rows and old analytics salts. */
  "maintenance.purge-expired": async () => {
    const now = new Date();
    await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: now } } });
    await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.verification.deleteMany({ where: { expiresAt: { lt: now } } });
    await purgeOldSalts(2, now);
    // Keep job history for 14 days.
    const cutoff = new Date(now.getTime() - 14 * 86_400_000);
    await db.job.deleteMany({ where: { status: "SUCCEEDED", completedAt: { lt: cutoff } } });
    await db.jobRun.deleteMany({ where: { startedAt: { lt: cutoff } } });
    // Repair search columns a write path may have missed (MySQL FULLTEXT document).
    await reconcileSearchDocuments(db as never);
  },
  /** Raw listing events are kept ≤ 35 days (roll-ups arrive in Phase 5). */
  "maintenance.purge-raw-events": async () => {
    const cutoff = new Date(Date.now() - 35 * 86_400_000);
    await db.listingEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
  },
};

Object.assign(handlers, {
  "email.deliver": async () => { await deliverPending(25); },
  /** Tells IndexNow search engines about new or changed listing pages. */
  "indexnow.ping": async (payload: unknown) => {
    const r = await pingIndexNow((payload as { paths?: string[] }).paths ?? []);
    if (!r.ok && r.status !== null) throw new Error(`IndexNow answered ${r.status}`);
  },
  "stats.rollup": async () => {
    await rollupDay(new Date());
    await rollupDay(new Date(Date.now() - 86_400_000));
  },
  "ranking.recompute": async () => { await recomputeScores(); },
  "submission.check": async (payload: unknown) => { await processSubmission((payload as { revisionId: string }).revisionId); },
  "monitor.enqueue": async () => { await enqueueDueScans(20); },
  "scan.listing": async (payload: unknown) => {
    const { listingId } = payload as { listingId: string };
    await monitorListing(listingId, "SCHEDULED");
  },
  /** Accounts in PENDING_DELETION for 30 days are permanently deleted. */
  /** In-app announcement to all active users or all developer members (chunked). */
  "notify.broadcast": async (payload: unknown) => {
    const { audience, title, body } = payload as { audience: "ALL_USERS" | "DEVELOPERS"; title: string; body: string };
    let cursor: string | undefined;
    for (;;) {
      const users = await db.user.findMany({ where: { status: "ACTIVE", ...(audience === "DEVELOPERS" ? { developerMembers: { some: {} } } : {}) }, select: { id: true }, take: 500, orderBy: { id: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!users.length) break;
      await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: "SYSTEM" as const, title, body: body || null })) });
      cursor = users[users.length - 1]!.id;
    }
  },
  "users.purge-deleted": async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    await db.user.deleteMany({ where: { status: "PENDING_DELETION", deletedAt: { lt: cutoff } } });
  },
  "maintenance.purge-history": async () => {
    await db.interactionEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    await db.authEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    await db.emailMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
  },
} satisfies Record<string, JobHandler>);

export const recurringJobs: Array<{ type: keyof typeof handlers & string; everyMinutes: number }> = [
  { type: "maintenance.purge-expired", everyMinutes: 60 },
  { type: "maintenance.purge-raw-events", everyMinutes: 24 * 60 },
  { type: "email.deliver", everyMinutes: 5 },
  { type: "stats.rollup", everyMinutes: 15 },
  { type: "ranking.recompute", everyMinutes: 60 },
  { type: "monitor.enqueue", everyMinutes: 15 },
  { type: "users.purge-deleted", everyMinutes: 24 * 60 },
  { type: "maintenance.purge-history", everyMinutes: 24 * 60 },
];
