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

async function limited(n = 60) {
  const h = await headers();
  const ip = clientIp(h, (await networkSettings()).trustedProxyHops) ?? "unknown";
  // Generous: mobile carriers put many phones behind one address, and browsers re-confirm.
  return !(await rateLimit(`push:${ip}`, n, 3600));
}

/**
 * Saves or re-confirms this browser's subscription. It is linked to the account signed in now,
 * or to no account (signed out), so a shared device never gets someone else's notifications.
 */
export async function POST(req: Request) {
  if (await limited()) return Response.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => null)) as (Record<string, unknown> & { standalone?: unknown; oldEndpoint?: unknown }) | null;
  if (!validSubscription(body)) return Response.json({ ok: false, error: "Invalid subscription" }, { status: 400 });
  const user = await getCurrentUser();
  await saveSubscription({ endpoint: body.endpoint, keys: body.keys }, user?.id ?? null, req.headers.get("user-agent"), {
    standalone: body.standalone === true,
    oldEndpoint: typeof body.oldEndpoint === "string" && body.oldEndpoint.length <= 2000 ? body.oldEndpoint : undefined,
  });
  return Response.json({ ok: true });
}

/** Removes this browser's subscription (notifications turned off). */
export async function DELETE(req: Request) {
  if (await limited()) return Response.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint === "string") await removeSubscription(body.endpoint);
  return Response.json({ ok: true });
}
