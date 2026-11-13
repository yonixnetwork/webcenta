import { headers } from "next/headers";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";

export const dynamic = "force-dynamic";

/** Ad loading failures reported by browsers (sendBeacon), written to the server log only. */
export async function POST(req: Request) {
  const h = await headers();
  const ip = clientIp(h, (await networkSettings()).trustedProxyHops) ?? "unknown";
  if (!(await rateLimit(`ads-log:${ip}`, 30, 3600))) return new Response(null, { status: 204 });
  const b = (await req.json().catch(() => null)) as { placement?: unknown; provider?: unknown; reason?: unknown } | null;
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[^a-z0-9-]/gi, "").slice(0, 40) : "?");
  console.warn(`[webcenta] ad ${clean(b?.provider)} placement=${clean(b?.placement)} failed: ${clean(b?.reason)}`);
  return new Response(null, { status: 204 });
}
