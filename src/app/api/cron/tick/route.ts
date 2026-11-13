import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSection } from "@/server/settings/store";
import { runTick } from "@/server/jobs/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function matches(header: string | null, secret: string): boolean {
  if (secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled-job entry point. On Hostinger the cron job runs scripts/cron-tick.mjs (copied next to
 * server.js), which reads the secret from the server's own environment and calls:
 *   POST https://webcenta.com/api/cron/tick   Authorization: Bearer <cron secret>
 * The secret is never in a URL or in the cron command. It is the one in Admin → Settings →
 * Scheduled tasks, or the CRON_SECRET environment variable (both are accepted, so changing the
 * setting does not break the cron job that reads the environment). GET and other methods are refused.
 */
export async function POST(request: NextRequest) {
  const c = await getSection("jobs");
  const secrets = [...new Set([c.str("cronSecret"), process.env.CRON_SECRET ?? ""])].filter((s) => s.length >= 32);
  if (!secrets.length) return Response.json({ error: "cron not configured" }, { status: 503 });
  const header = request.headers.get("authorization");
  if (!secrets.some((s) => matches(header, s))) {
    console.warn("[webcenta] cron tick refused: missing or wrong Authorization header");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runTick(c.num("tickBudgetMs") || 25_000, "cron");
    console.log(`[webcenta] cron tick ${result.skipped ? "skipped (another run in progress)" : `processed=${result.processed} failed=${result.failed} enqueued=${result.enqueued}`} in ${result.durationMs}ms`);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(`[webcenta] cron tick failed: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`);
    return Response.json({ error: "tick failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
