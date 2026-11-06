import { db } from "@/server/db";
import { purgeOldSalts } from "@/server/analytics/visitor";

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
  },
  /** Raw listing events are kept ≤ 35 days (roll-ups arrive in Phase 5). */
  "maintenance.purge-raw-events": async () => {
    const cutoff = new Date(Date.now() - 35 * 86_400_000);
    await db.listingEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
  },
};

export const recurringJobs: Array<{ type: keyof typeof handlers & string; everyMinutes: number }> = [
  { type: "maintenance.purge-expired", everyMinutes: 60 },
  { type: "maintenance.purge-raw-events", everyMinutes: 24 * 60 },
];
