import { toNextJsHandler } from "better-auth/next-js";
import { auth, type AuthSurface } from "@/server/auth/user-auth";
import { db } from "@/server/db";
import { recordSecurityEvent } from "@/server/security/events";
import { clientIp, networkSettings } from "@/server/viewer";

/** developers.<host>/api/auth → the developer portal's instance; everything else → the public one. */
const surfaceOf = (req: Request): AuthSurface => (req.headers.get("x-webcenta-surface") === "developer" ? "developer" : "public");
const handler = async (req: Request) => toNextJsHandler(await auth(surfaceOf(req)));

export async function GET(req: Request) {
  return (await handler(req)).GET(req);
}

export async function POST(req: Request) {
  const res = await (await handler(req)).POST(req);
  // Record failed email sign-ins (for login history / abuse investigation).
  const path = new URL(req.url).pathname;
  if (res.status === 429 || (path.endsWith("/sign-in/email") && res.status >= 400)) {
    const ip = clientIp(req.headers, (await networkSettings()).trustedProxyHops) ?? "unknown";
    await recordSecurityEvent(res.status === 429 ? "rate.limited" : "user.login.failed", res.status === 429 ? `auth${path.replace(/^.*\/api\/auth/, "")}:${ip}` : ip, { severity: res.status === 429 ? "warning" : "info" });
  }
  if (path.endsWith("/sign-in/email") && res.status >= 400) {
    const body = await req.clone().json().catch(() => ({}) as { email?: string });
    const email = typeof body.email === "string" ? body.email.toLowerCase().slice(0, 254) : null;
    const user = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
    await db.authEvent.create({
      data: { type: "LOGIN_FAILED", email, userId: user?.id ?? null, ipAddress: clientIp(req.headers, (await networkSettings()).trustedProxyHops) ?? null, userAgent: req.headers.get("user-agent"), metadata: { status: res.status } },
    }).catch(() => undefined);
  }
  return res;
}
