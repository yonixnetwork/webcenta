/** Runs one job tick from a shell (VPS cron/systemd). On Hostinger use the HTTPS endpoint instead. */
import "dotenv/config";
import { runTick } from "../src/server/jobs/runner";
import { db } from "../src/server/db";

runTick(Number(process.env.JOBS_TICK_BUDGET_MS ?? 25_000))
  .then((r) => console.log(JSON.stringify(r)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
