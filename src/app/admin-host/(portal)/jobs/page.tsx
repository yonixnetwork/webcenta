import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { retryJobAction } from "@/server/actions/admin";
import { minutesSince } from "@/lib/time";

export const metadata = { title: "Jobs & email" };

export default async function JobsPage() {
  await requireAdmin("jobs.view");
  const [runs, failing, counts, email] = await Promise.all([
    db.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    db.job.findMany({ where: { status: { in: ["FAILED", "DEAD"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.job.groupBy({ by: ["status"], _count: true }),
    db.emailMessage.groupBy({ by: ["status"], _count: true }),
  ]);
  const lastRun = runs[0];
  const stale = !lastRun || minutesSince(lastRun.startedAt) > 30;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Jobs & email</h1>
      <p className={stale ? "rounded-xl bg-danger-soft p-3 text-sm text-danger" : "rounded-xl bg-success-soft p-3 text-sm text-success"}>
        {lastRun ? `Last scheduler run: ${lastRun.startedAt.toISOString().replace("T", " ").slice(0, 16)} UTC.` : "The scheduler has never run."} {stale && "Check the Hostinger cron job (POST /api/cron/tick every 10 minutes)."}
      </p>
      <p className="text-sm">Queue: {counts.map((c) => `${c.status.toLowerCase()} ${c._count}`).join(" · ") || "empty"} · Email: {email.map((c) => `${c.status.toLowerCase()} ${c._count}`).join(" · ") || "none"}</p>
      <h2 className="text-lg font-bold">Failed / dead jobs</h2>
      <DataTable head={["Type", "Status", "Attempts", "Error", "Created", ""]} empty={failing.length === 0}>
        {failing.map((j) => <tr key={j.id}><td className={td}>{j.type}</td><td className={td}><StatusPill status={j.status} /></td><td className={td}>{j.attempts}/{j.maxAttempts}</td><td className={`${td} max-w-sm truncate text-xs`}>{j.lastError}</td><td className={td}>{formatDate(j.createdAt)}</td><td className={td}><form action={retryJobAction.bind(null, j.id)}><button className="text-sm text-brand">Retry</button></form></td></tr>)}
      </DataTable>
      <h2 className="text-lg font-bold">Recent scheduler runs</h2>
      <DataTable head={["Started", "Finished", "Processed", "Failed", "Error"]}>
        {runs.map((r) => <tr key={r.id}><td className={td}>{r.startedAt.toISOString().replace("T", " ").slice(0, 19)}</td><td className={td}>{r.finishedAt?.toISOString().slice(11, 19) ?? "—"}</td><td className={td}>{r.processed}</td><td className={td}>{r.failed}</td><td className={td}>{r.error ?? ""}</td></tr>)}
      </DataTable>
    </>
  );
}
