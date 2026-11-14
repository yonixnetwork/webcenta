import { db } from "@/server/db";
import { purgeOldSalts } from "@/server/analytics/visitor";
import { deliverPending } from "@/server/email/send";
import { enqueueDueScans, monitorListing } from "@/server/scanner/monitor";
import { processSubmission } from "@/server/listings/workflow";
import { refreshVisitCounts, rollupDay } from "@/server/analytics/stats";
import { recomputeScores } from "@/server/analytics/ranking";
import { reconcileSearchDocuments } from "@/server/search/document";
import { pingIndexNow } from "@/server/settings/site";

/** A handler may return what it did (a count or a small object), shown in Admin → Scheduler. */
export type JobHandler = (payload: unknown) => Promise<unknown>;

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
  "email.deliver": async () => deliverPending(25),
  /** Tells IndexNow search engines about new or changed listing pages. */
  "indexnow.ping": async (payload: unknown) => {
    const r = await pingIndexNow((payload as { paths?: string[] }).paths ?? []);
    if (!r.ok && r.status !== null) throw new Error(`IndexNow answered ${r.status}`);
  },
  "stats.rollup": async () => {
    await rollupDay(new Date());
    await rollupDay(new Date(Date.now() - 86_400_000));
    await refreshVisitCounts();
  },
  "ranking.recompute": async () => { await recomputeScores(); },
  "submission.check": async (payload: unknown) => { await processSubmission((payload as { revisionId: string }).revisionId); },
  "monitor.enqueue": async () => enqueueDueScans(20),
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
  /** Continues push campaigns in batches. */
  "push.campaigns": async () => {
    const { continueCampaigns } = await import("@/server/push/push");
    return continueCampaigns(15_000);
  },
  /** Imports queued web apps (Admin → Import web apps; Settings → Automatic web app imports). */
  "imports.run": async () => {
    const { runImports } = await import("@/server/importer/importer");
    return runImports();
  },
  /** Marks queued imports whose website is already listed (or queued twice) as duplicates. */
  "imports.dedupe": async () => {
    const { skipQueuedDuplicates } = await import("@/server/importer/dedupe");
    return skipQueuedDuplicates();
  },
  /** Removes old duplicate and permanently failed import records (logged). */
  "imports.cleanup": async () => {
    const { cleanupImports } = await import("@/server/importer/cleanup");
    return cleanupImports();
  },
  /** Proposes fuller descriptions for imported listings whose description is too short. */
  "imports.enrich": async () => {
    const { enrichDescriptions } = await import("@/server/importer/enrich");
    return enrichDescriptions();
  },
  /** Notifications for a newly published app / an updated saved app, and inactivity reminders. */
  "notify.new-app": async (payload: unknown) => {
    const { notifyNewApp } = await import("@/server/community/notifications");
    await notifyNewApp((payload as { listingId: string }).listingId);
  },
  "notify.app-updated": async (payload: unknown) => {
    const { notifySavedAppUpdated } = await import("@/server/community/notifications");
    const p = payload as { listingId: string; revisionId?: string };
    return notifySavedAppUpdated(p.listingId, p.revisionId);
  },
  "notify.reminders": async () => {
    const { sendInactivityReminders } = await import("@/server/community/notifications");
    return sendInactivityReminders();
  },
  "users.purge-deleted": async () => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000);
    return (await db.user.deleteMany({ where: { status: "PENDING_DELETION", deletedAt: { lt: cutoff } } })).count;
  },
  "maintenance.purge-history": async () => {
    await db.interactionEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    await db.authEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * 86_400_000) } } });
    await db.emailMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
    await db.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } } });
  },
} satisfies Record<string, JobHandler>);

/**
 * Recurring jobs, enqueued by every scheduler tick once per window. Frequencies follow the
 * workload: cheap, user-facing work often; network-heavy or expensive work less often.
 * `label` and `what` are shown in Admin → Scheduler.
 */
export const recurringJobs: Array<{ type: keyof typeof handlers & string; everyMinutes: number; label: string; what: string }> = [
  { type: "email.deliver", everyMinutes: 5, label: "Email retries", what: "Retries emails that could not be sent immediately." },
  { type: "push.campaigns", everyMinutes: 5, label: "Push announcements", what: "Continues sending announcement batches (100 devices per batch)." },
  { type: "imports.run", everyMinutes: 10, label: "Import web apps", what: "Imports the next queued web apps (Settings → Automatic web app imports sets how often and how many)." },
  { type: "imports.dedupe", everyMinutes: 60, label: "Duplicate detection", what: "Skips queued imports whose website is already listed or queued under another address." },
  { type: "imports.cleanup", everyMinutes: 24 * 60, label: "Import clean-up", what: "Deletes duplicate and permanently failed import records after the retention period (logged; never listings)." },
  { type: "imports.enrich", everyMinutes: 60, label: "Description enrichment", what: "Proposes fuller descriptions (from each app's own website) for imported listings, for review." },
  { type: "stats.rollup", everyMinutes: 15, label: "Analytics roll-up", what: "Aggregates views and visits per day and refreshes visit counters." },
  { type: "monitor.enqueue", everyMinutes: 15, label: "Security re-checks", what: "Queues periodic security scans of listings that are due." },
  { type: "ranking.recompute", everyMinutes: 60, label: "Rankings", what: "Recomputes trending and popularity scores." },
  { type: "maintenance.purge-expired", everyMinutes: 60, label: "Clean-up (hourly)", what: "Removes expired sessions, rate-limit buckets, old job history." },
  { type: "notify.reminders", everyMinutes: 6 * 60, label: "Inactivity reminders", what: "Reminds push users who were away that new apps arrived." },
  { type: "maintenance.purge-raw-events", everyMinutes: 24 * 60, label: "Raw event clean-up", what: "Deletes raw listing events older than 35 days." },
  { type: "users.purge-deleted", everyMinutes: 24 * 60, label: "Account deletion", what: "Permanently deletes accounts 30 days after the user asked." },
  { type: "maintenance.purge-history", everyMinutes: 24 * 60, label: "History clean-up", what: "Deletes old interaction, sign-in, email and push delivery history." },
];
