import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database reachability for uptime monitoring. Exposes no details. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
