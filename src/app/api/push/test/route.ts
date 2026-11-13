import { headers } from "next/headers";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";
import { sendTestPush } from "@/server/push/push";

export const dynamic = "force-dynamic";

/**
 * Sends one test notification to the calling browser's own subscription. Only the browser that
 * holds a subscription knows its endpoint (a long random URL), so it can only test itself.
 */
export async function POST(req: Request) {
  const h = await headers();
  const ip = clientIp(h, (await networkSettings()).trustedProxyHops) ?? "unknown";
  if (!(await rateLimit(`push-test:${ip}`, 6, 3600))) return Response.json({ ok: false, message: "Too many tests. Try again in an hour." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string" || body.endpoint.length > 2000) return Response.json({ ok: false, message: "Invalid request." }, { status: 400 });
  const r = await sendTestPush(body.endpoint);
  if (!r.found) return Response.json({ ok: false, message: "Webcenta does not know this browser's subscription. Turn notifications off and on again." }, { status: 404 });
  if (r.accepted) return Response.json({ ok: true, message: `The push service accepted the test (HTTP ${r.statusCode ?? 201}). It should appear within a minute. If it does not, check that notifications for this browser or app are allowed in the device settings and that Focus / Do Not Disturb is off.` });
  const why: Record<string, string> = {
    expired: "The push service says this subscription no longer exists. Turn notifications on again.",
    unauthorized: "The push service rejected Webcenta's key for this subscription. Turn notifications off and on again.",
    "rate-limited": "The push service is limiting messages right now. Try again later.",
    "service-error": "The push service had a temporary error. Try again later.",
    network: "Webcenta could not reach the push service. Try again later.",
  };
  return Response.json({ ok: false, message: why[r.category ?? ""] ?? `The push service did not accept the test (${r.category ?? "error"}${r.statusCode ? `, HTTP ${r.statusCode}` : ""}).` });
}
