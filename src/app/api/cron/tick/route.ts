import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSection } from "@/server/settings/store";
import { runTick } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled-job entry point for Hostinger Cron Jobs:
 *   curl -fsS -X POST -H "Authorization: Bearer <cron secret>" https://webcenta.com/api/cron/tick
 * The secret and time budget come from Admin → Settings → Scheduled tasks (or
 * CRON_SECRET / JOBS_TICK_BUDGET_MS).
 */
export async function POST(request: NextRequest) {
  const c = await getSection("jobs");
  const secret = c.str("cronSecret");
  if (secret.length < 32) {
    return Response.json({ error: "cron not configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runTick(c.num("tickBudgetMs") || 25_000);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
