import { headers } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";
import { removeSubscription, saveSubscription, validSubscription, vapidKeys } from "@/server/push/push";

export const dynamic = "force-dynamic";

/** The VAPID public key the browser needs to subscribe. */
export async function GET() {
  const { publicKey } = await vapidKeys();
  return Response.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
}

async function limited() {
  const h = await headers();
  const ip = clientIp(h, (await networkSettings()).trustedProxyHops) ?? "unknown";
  return !(await rateLimit(`push:${ip}`, 20, 3600));
}

/** Saves this browser's push subscription (no account needed; linked to the user when signed in). */
export async function POST(req: Request) {
  if (await limited()) return Response.json({ ok: false }, { status: 429 });
  const body = await req.json().catch(() => null);
  if (!validSubscription(body)) return Response.json({ ok: false, error: "Invalid subscription" }, { status: 400 });
  const user = await getCurrentUser();
  await saveSubscription(body, user?.id ?? null, req.headers.get("user-agent"));
  return Response.json({ ok: true });
}

/** Removes this browser's subscription (notifications turned off). */
export async function DELETE(req: Request) {
  if (await limited()) return Response.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") await removeSubscription(body.endpoint);
  return Response.json({ ok: true });
}
