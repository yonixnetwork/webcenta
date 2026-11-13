import { ActionForm } from "@/components/ui/action-form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { retryJobAction, runJobNowAction, runTickNowAction, setJobEnabledAction } from "@/server/actions/admin";
import { recurringJobs } from "@/server/jobs/handlers";
import { disabledJobTypes } from "@/server/jobs/runner";
import { daysAgo, minutesSince, nextWindow } from "@/lib/time";

export const metadata = { title: "Scheduler" };

const utc = (d: Date | null | undefined) => (d ? `${d.toISOString().replace("T", " ").slice(0, 16)} UTC` : "—");
const every = (m: number) => (m % 1440 === 0 ? `every ${m / 1440 === 1 ? "day" : `${m / 1440} days`}` : m % 60 === 0 ? `every ${m / 60 === 1 ? "hour" : `${m / 60} hours`}` : `every ${m} minutes`);

/** Admin → Scheduler: every scheduled job, its last real execution and a Run now action. */
export default async function SchedulerPage() {
  await requireAdmin("jobs.view");
  const types = recurringJobs.map((r) => r.type);
  const [runs, failing, counts, email, off, lastByType, lastCronRun] = await Promise.all([
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 25 }),
    db.job.findMany({ where: { status: { in: ["FAILED", "DEAD"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.job.groupBy({ by: ["status"], _count: true }),
    db.emailMessage.groupBy({ by: ["status"], _count: true }),
    disabledJobTypes(),
    Promise.all(types.map((type) => db.job.findFirst({ where: { type, status: { in: ["SUCCEEDED", "DEAD", "PENDING"] }, startedAt: { not: null } }, orderBy: { startedAt: "desc" } }))),
    db.jobRun.findFirst({ where: { trigger: "cron" }, orderBy: { startedAt: "desc" } }),
  ]);
  const stale = !lastCronRun || minutesSince(lastCronRun.startedAt) > 15;
  const failedByType = await db.job.groupBy({ by: ["type"], where: { type: { in: types }, status: "DEAD", createdAt: { gte: daysAgo(7) } }, _count: true });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Scheduler</h1>
      <p className={stale ? "rounded-xl bg-danger-soft p-3 text-sm text-danger" : "rounded-xl bg-success-soft p-3 text-sm text-success"} data-testid="scheduler-health">
        {lastCronRun ? `Last run by the hosting cron job: ${utc(lastCronRun.startedAt)}${lastCronRun.skipped ? " (skipped: another run was in progress)" : ""}.` : "The hosting cron job has never called the scheduler."}{" "}
        {stale && "Expected every 5 minutes. Check the cron job in hPanel → Advanced → Cron Jobs (see docs/production-repair/cron-setup.md)."}
      </p>
      <p className="text-sm">Queue: {counts.map((c) => `${c.status.toLowerCase()} ${c._count}`).join(" · ") || "empty"} · Email: {email.map((c) => `${c.status.toLowerCase()} ${c._count}`).join(" · ") || "none"} · All times UTC.</p>
      <ActionForm action={runTickNowAction} submitLabel="Run the scheduler now" pendingLabel="Running…" variant="secondary" className="flex flex-wrap items-center gap-3 space-y-0" />

      <h2 className="text-lg font-bold">Scheduled jobs</h2>
      <DataTable head={["Job", "Status", "Schedule", "Last execution", "Next expected", "Last result", "Duration", "Failed (7 days)", ""]}>
        {recurringJobs.map((r, i) => {
          const last = lastByType[i];
          const enabled = !off.includes(r.type);
          const next = enabled ? nextWindow(r.everyMinutes) : null;
          const resultText = !last ? "never ran" : last.status === "SUCCEEDED" ? (last.result ? JSON.stringify(last.result).slice(0, 80) : "succeeded") : `${last.status === "DEAD" ? "failed" : "retrying"}: ${(last.lastError ?? "").slice(0, 120)}`;
          return (
            <tr key={r.type} data-job={r.type}>
              <td className={td}><span className="font-medium">{r.label}</span><br /><span className="font-mono text-xs text-subtle">{r.type}</span><br /><span className="text-xs text-muted">{r.what}</span></td>
              <td className={td}><StatusPill status={enabled ? "ENABLED" : "PAUSED"} /></td>
              <td className={td}>{every(r.everyMinutes)}</td>
              <td className={td}>{utc(last?.startedAt)}</td>
              <td className={td}>{next ? `${utc(next)} or the next cron call after it` : "paused"}</td>
              <td className={`${td} max-w-64 text-xs`}>{last && <StatusPill status={last.status} />} <span className="break-words">{resultText}</span></td>
              <td className={td}>{last?.durationMs != null ? `${last.durationMs} ms` : "—"}</td>
              <td className={td}>{failedByType.find((f) => f.type === r.type)?._count ?? 0}</td>
              <td className={td}>
                <div className="flex flex-col gap-2">
                  <ActionForm action={runJobNowAction} submitLabel="Run now" pendingLabel="Running…" variant="secondary" className="space-y-2"><input type="hidden" name="type" value={r.type} /></ActionForm>
                  <form action={setJobEnabledAction.bind(null, r.type, !enabled)}><button className="text-sm text-brand underline">{enabled ? "Pause" : "Resume"}</button></form>
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>

      <h2 className="text-lg font-bold">Failed jobs</h2>
      <DataTable head={["Type", "Status", "Attempts", "Error", "Created", ""]} empty={failing.length === 0}>
        {failing.map((j) => <tr key={j.id}><td className={td}>{j.type}<br /><span className="font-mono text-xs text-subtle">{j.id.slice(-8)}</span></td><td className={td}><StatusPill status={j.status} /></td><td className={td}>{j.attempts}/{j.maxAttempts}</td><td className={`${td} max-w-sm text-xs break-words`}>{j.lastError}</td><td className={td}>{formatDate(j.createdAt)}</td><td className={td}><form action={retryJobAction.bind(null, j.id)}><button className="text-sm text-brand">Retry</button></form></td></tr>)}
      </DataTable>

      <h2 className="text-lg font-bold">Recent scheduler runs</h2>
      <DataTable head={["Started (UTC)", "Trigger", "Duration", "Scheduled", "Processed", "Failed", "Result"]}>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className={td}>{r.startedAt.toISOString().replace("T", " ").slice(0, 19)}</td>
            <td className={td}>{r.trigger === "admin" ? r.runner.replace(/^admin:/, "admin: ") : r.trigger}</td>
            <td className={td}>{r.finishedAt ? `${r.finishedAt.getTime() - r.startedAt.getTime()} ms` : "running or interrupted"}</td>
            <td className={td}>{r.enqueued}</td>
            <td className={td}>{r.processed}</td>
            <td className={td}>{r.failed}</td>
            <td className={`${td} text-xs`}>{r.skipped ? "skipped (overlap)" : r.error ?? (r.finishedAt ? "ok" : "")}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
