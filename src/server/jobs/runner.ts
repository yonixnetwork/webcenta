import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { handlers, recurringJobs } from "./handlers";

/**
 * Database-backed job runner (ADR-0005). Invoked by Hostinger Cron through
 * scripts/cron-tick.mjs → POST /api/cron/tick (or `npm run jobs:tick` where a shell can run
 * TypeScript). Only one tick works at a time (a lease in SystemSetting "jobs.lock"); a second,
 * overlapping invocation records a skipped run and returns at once. Individual jobs are claimed
 * with FOR UPDATE SKIP LOCKED, so even a lock taken over after a crash never runs a job twice.
 */
const STALE_LOCK_MINUTES = 10;
const BATCH = 5;
const LOCK_KEY = "jobs.lock";
const DISABLED_KEY = "jobs.disabled";

export interface TickResult {
  runId: string;
  enqueued: number;
  processed: number;
  failed: number;
  recovered: number;
  /** Another run held the scheduler lock. */
  skipped?: boolean;
  durationMs?: number;
}

export function backoffSeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}

/** Recurring job types an administrator paused (Admin → Scheduler). */
export async function disabledJobTypes(): Promise<string[]> {
  const row = await db.systemSetting.findUnique({ where: { key: DISABLED_KEY } });
  const v = row?.value as { types?: unknown } | null;
  return Array.isArray(v?.types) ? v.types.filter((t): t is string => typeof t === "string") : [];
}

export async function setJobEnabled(type: string, enabled: boolean, adminId?: string) {
  if (!recurringJobs.some((r) => r.type === type)) throw new Error(`Unknown scheduled job "${type}"`);
  const now = new Set(await disabledJobTypes());
  if (enabled) now.delete(type); else now.add(type);
  const value = { types: [...now].sort() };
  await db.systemSetting.upsert({ where: { key: DISABLED_KEY }, create: { key: DISABLED_KEY, value, description: "Paused scheduled jobs", updatedByAdminId: adminId ?? null }, update: { value, updatedByAdminId: adminId ?? null } });
}

/** Enqueue recurring jobs once per window using dedupe keys (paused types are left out). */
export async function enqueueRecurring(now = new Date()): Promise<number> {
  const off = new Set(await disabledJobTypes());
  let n = 0;
  for (const r of recurringJobs) {
    if (off.has(r.type)) continue;
    const windowStart = Math.floor(now.getTime() / (r.everyMinutes * 60_000));
    const dedupeKey = `${r.type}:${windowStart}`;
    const res = await db.job.createMany({ data: [{ type: r.type, payload: {}, dedupeKey }], skipDuplicates: true });
    n += res.count;
  }
  return n;
}

/** Takes the scheduler lease for `ms`; false when another run holds an unexpired lease. */
export async function acquireTickLock(runId: string, ms: number): Promise<boolean> {
  await db.systemSetting.createMany({ data: [{ key: LOCK_KEY, value: { until: 0, runId: null }, description: "Scheduler lease (one tick at a time)" }], skipDuplicates: true });
  const now = Date.now();
  const changed = await db.$executeRaw`
    UPDATE SystemSetting SET value = JSON_OBJECT('until', ${now + ms}, 'runId', ${runId}), updatedAt = UTC_TIMESTAMP(3)
    WHERE \`key\` = ${LOCK_KEY} AND CAST(JSON_UNQUOTE(JSON_EXTRACT(value, '$.until')) AS UNSIGNED) < ${now}`;
  return changed === 1;
}

export async function releaseTickLock(runId: string) {
  await db.$executeRaw`
    UPDATE SystemSetting SET value = JSON_OBJECT('until', 0, 'runId', NULL), updatedAt = UTC_TIMESTAMP(3)
    WHERE \`key\` = ${LOCK_KEY} AND JSON_UNQUOTE(JSON_EXTRACT(value, '$.runId')) = ${runId}`;
}

async function claim(runner: string): Promise<Array<{ id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }>> {
  // Lock a batch that no other runner holds (SKIP LOCKED: MariaDB >= 10.6, MySQL >= 8.0),
  // mark it RUNNING and read it back, all in one transaction.
  return db.$transaction(async (tx) => {
    const picked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM Job WHERE status = 'PENDING' AND runAt <= UTC_TIMESTAMP(3)
      ORDER BY priority DESC, runAt ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
    const ids = picked.map((r) => r.id);
    if (ids.length === 0) return [];
    await tx.job.updateMany({ where: { id: { in: ids } }, data: { status: "RUNNING", lockedAt: new Date(), startedAt: new Date(), lockedBy: runner, attempts: { increment: 1 } } });
    return tx.job.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, payload: true, attempts: true, maxAttempts: true } });
  });
}

/** What a handler reported, stored as JSON (numbers become { count }). */
function asResult(v: unknown): object | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return { count: v };
  try { return JSON.parse(JSON.stringify(v)) as object; } catch { return undefined; }
}

/** Runs one claimed job and records the outcome; returns true on success. */
async function execute(job: { id: string; type: string; payload: unknown; attempts: number; maxAttempts: number }): Promise<boolean> {
  const handler = handlers[job.type];
  const t0 = Date.now();
  try {
    if (!handler) throw new Error(`No handler for job type "${job.type}"`);
    const out = await handler(job.payload);
    await db.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", completedAt: new Date(), durationMs: Date.now() - t0, result: asResult(out) ?? undefined, lockedAt: null, lastError: null } });
    return true;
  } catch (err) {
    const dead = job.attempts >= job.maxAttempts;
    console.error(`[webcenta] job ${job.type} (${job.id}) failed (attempt ${job.attempts}/${job.maxAttempts}): ${String(err instanceof Error ? err.message : err).slice(0, 300)}`);
    await db.job.update({
      where: { id: job.id },
      data: {
        status: dead ? "DEAD" : "PENDING",
        lockedAt: null,
        lockedBy: null,
        durationMs: Date.now() - t0,
        lastError: String(err instanceof Error ? err.message : err).slice(0, 2000),
        runAt: new Date(Date.now() + backoffSeconds(job.attempts) * 1000),
      },
    });
    return false;
  }
}

export async function runTick(budgetMs: number, trigger: "cron" | "admin" | "cli" = "cron"): Promise<TickResult> {
  const started = Date.now();
  const runner = `tick-${randomUUID().slice(0, 8)}`;
  const run = await db.jobRun.create({ data: { runner, trigger } });
  const result: TickResult = { runId: run.id, enqueued: 0, processed: 0, failed: 0, recovered: 0 };
  // The lease outlives the budget a little (the last job may finish after it), and expires on its
  // own if this process dies, so a crashed run never blocks the scheduler for long.
  if (!(await acquireTickLock(run.id, budgetMs + 90_000))) {
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), skipped: true, error: "Another scheduler run is still in progress" } });
    return { ...result, skipped: true, durationMs: Date.now() - started };
  }
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
        if (await execute(job)) result.processed++; else result.failed++;
      }
    }
    result.durationMs = Date.now() - started;
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), processed: result.processed, failed: result.failed, enqueued: result.enqueued, recovered: result.recovered } });
  } catch (err) {
    await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), processed: result.processed, failed: result.failed, enqueued: result.enqueued, recovered: result.recovered, error: String(err).slice(0, 2000) } });
    throw err;
  } finally {
    await releaseTickLock(run.id).catch(() => undefined);
  }
  return result;
}

/**
 * Admin → Scheduler → Run now: runs one scheduled job type immediately, through the same handler
 * and the same Job record the cron uses, and reports what actually happened.
 */
export async function runJobNow(type: string, adminId: string): Promise<{ ok: boolean; jobId: string; durationMs: number; result?: object; error?: string }> {
  if (!recurringJobs.some((r) => r.type === type)) throw new Error(`Unknown scheduled job "${type}"`);
  const busy = await db.job.findFirst({ where: { type, status: "RUNNING", lockedAt: { gt: new Date(Date.now() - STALE_LOCK_MINUTES * 60_000) } }, select: { id: true } });
  if (busy) return { ok: false, jobId: busy.id, durationMs: 0, error: "This job is already running. Wait for it to finish." };
  const job = await db.job.create({ data: { type, payload: {}, status: "RUNNING", lockedAt: new Date(), startedAt: new Date(), lockedBy: `admin-${adminId.slice(0, 8)}`, attempts: 1, maxAttempts: 1, dedupeKey: `${type}:admin:${randomUUID()}` } });
  const ok = await execute({ id: job.id, type, payload: {}, attempts: 1, maxAttempts: 1 });
  const done = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  await db.jobRun.create({ data: { runner: `admin:${type}`, trigger: "admin", finishedAt: new Date(), processed: ok ? 1 : 0, failed: ok ? 0 : 1, error: ok ? null : done.lastError } });
  return { ok, jobId: job.id, durationMs: done.durationMs ?? 0, result: (done.result as object | null) ?? undefined, error: done.lastError ?? undefined };
}
