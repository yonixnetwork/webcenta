import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { getSection } from "@/server/settings/store";

/**
 * Scheduled job "imports.cleanup" (daily). Removes only temporary import records that never
 * became a listing, after a retention period, and records every removal in the audit log
 * (Admin → Import web apps → Clean-up history).
 *
 * Deleted (after the retention period, default 30 days):
 *  - queue entries skipped as confirmed duplicates (the existing listing is recorded);
 *  - queue entries that failed permanently (not retryable, or out of attempts);
 *  - finished scheduler jobs that failed permanently (DEAD).
 * Reset: imports left "importing" for more than a day go back to the queue.
 *
 * Never touched: anything with a listing (published apps, developer submissions, listings with
 * reviews, saved records, ownership claims, appeals or moderation), and developer submissions.
 */
export async function cleanupImports(now = new Date()): Promise<{ duplicates: number; failed: number; deadJobs: number; reset: number }> {
  const days = Math.min(365, Math.max(7, (await getSection("imports")).num("cleanupRetentionDays") || 30));
  const before = new Date(now.getTime() - days * 86_400_000);
  const base = { listingId: null, processedAt: { lt: before } } as const;

  const dupRows = await db.importCandidate.findMany({ where: { ...base, status: "SKIPPED", errorCategory: "duplicate" }, select: { id: true, domain: true, duplicateOfListingId: true }, take: 2000 });
  const failRows = await db.importCandidate.findMany({ where: { ...base, status: "FAILED", OR: [{ retryable: false }, { attempts: { gte: 3 } }] }, select: { id: true, domain: true, failedStage: true, errorCategory: true }, take: 2000 });
  if (dupRows.length) await db.importCandidate.deleteMany({ where: { id: { in: dupRows.map((r) => r.id) }, listingId: null } });
  if (failRows.length) await db.importCandidate.deleteMany({ where: { id: { in: failRows.map((r) => r.id) }, listingId: null } });
  const deadJobs = (await db.job.deleteMany({ where: { status: "DEAD", createdAt: { lt: before } } })).count;
  const reset = (await db.importCandidate.updateMany({ where: { status: "IMPORTING", processedAt: { lt: new Date(now.getTime() - 86_400_000) } }, data: { status: "QUEUED" } })).count;

  if (dupRows.length || failRows.length || deadJobs || reset) {
    await audit({
      actorType: "SYSTEM", action: "imports.cleanup",
      metadata: {
        retentionDays: days,
        deletedDuplicates: dupRows.length, deletedFailed: failRows.length, deletedDeadJobs: deadJobs, resetImporting: reset,
        // What was removed and why (domains only), capped to keep the record small.
        duplicates: dupRows.slice(0, 50).map((r) => ({ domain: r.domain, duplicateOf: r.duplicateOfListingId })),
        failed: failRows.slice(0, 50).map((r) => ({ domain: r.domain, stage: r.failedStage, category: r.errorCategory })),
      },
    });
  }
  return { duplicates: dupRows.length, failed: failRows.length, deadJobs, reset };
}
