import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { handlers, recurringJobs } from "./handlers";

/**
 * Database-backed job runner (ADR-0005). Invoked by Hostinger Cron through
 * POST /api/cron/tick (or `npm run jobs:tick` where a shell cron can run Node).
 * Safe to run concurrently: claims use FOR UPDATE SKIP LOCKED.
 */
const STALE_LOCK_MINUTES = 10;
const BATCH = 5;

export interface TickResult {
  runId: string;
  enqueued: number;
  processed: number;
  failed: number;
  recovered: number;
}

export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

/** Enqueue recurring jobs once per window using dedupe keys. */
export async function enqueueRecurring(now = new Date()): Promise<number> {
  let n = 0;
  for (const r of recurringJobs) {
    const windowStart = Math.floor(now.getTime() / (r.everyMinutes * 60_000));
    const dedupeKey = `${r.type}:${windowStart}`;
    const res = await db.job.createMany({ data: [{ type: r.type, payload: {}, dedupeKey }], skipDuplicates: true });
    n += res.count;
  }
  return n;
}

async function claim(runner: string): Promise<Array<{ id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }>> {
  return db.$queryRaw`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${runner}, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Job" WHERE status = 'PENDING' AND "runAt" <= now()
      ORDER BY priority DESC, "runAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"`;
}

export async function runTick(budgetMs: number): Promise<TickResult> {
  const started = Date.now();
  const runner = `tick-${randomUUID().slice(0, 8)}`;
  const run = await db.jobRun.create({ data: { runner } });
  const result: TickResult = { runId: run.id, enqueued: 0, processed: 0, failed: 0, recovered: 0 };
  try {
    const recovered = await db.job.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MINUTES * 60_000) } },
      data: { status: "PENDING", lockedAt: null, lockedBy: null },
    });
    result.recovered = recovered.count;
    result.enqueued = await enqueueRecurring();

    while (Date.now() - started < budgetMs) {
      const jobs = await claim(runner);
      if (jobs.length === 0) break;
      for (const job of jobs) {
        const handler = handlers[job.type];
        try {
          if (!handler) throw new Error(`No handler for job type "${job.type}"`);
          await handler(job.payload);
          await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null, lastError: null } });
          result.processed++;
        } catch (err) {
          result.failed++;
          const dead = job.attempts >= job.maxAttempts;
          await db.job.update({
            where: { id: job.id },
            data: {
              status: dead ? "DEAD" : "PENDING",
              lockedAt: null,
              lockedBy: null,
              lastError: String(err instanceof Error ? err.message : err).slice(0, 2000),
              runAt: new Date(Date.now() + backoffSeconds(job.attempts) * 1000),
            },
          });
        }
      }
    }
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), processed: result.processed, failed: result.failed } });
  } catch (err) {
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error: String(err).slice(0, 2000) } });
    throw err;
  }
  return result;
}
