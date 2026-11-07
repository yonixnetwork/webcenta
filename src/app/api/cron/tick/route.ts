import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
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
 *   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://webcenta.com/api/cron/tick
 */
export async function POST(request: NextRequest) {
  const e = env();
  if (!e.CRON_SECRET || e.CRON_SECRET.length < 32) {
    return Response.json({ error: "cron not configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), e.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runTick(e.JOBS_TICK_BUDGET_MS);
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
