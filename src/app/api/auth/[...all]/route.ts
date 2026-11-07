import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/user-auth";
import { db } from "@/server/db";

const handler = () => toNextJsHandler(auth());

export async function GET(req: Request) {
  return handler().GET(req);
}

export async function POST(req: Request) {
  const res = await handler().POST(req);
  // Record failed email sign-ins (for login history / abuse investigation).
  if (new URL(req.url).pathname.endsWith("/sign-in/email") && res.status >= 400) {
    const body = await req.clone().json().catch(() => ({}) as { email?: string });
    const email = typeof body.email === "string" ? body.email.toLowerCase().slice(0, 254) : null;
    const user = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
    await db.authEvent.create({
      data: { type: "LOGIN_FAILED", email, userId: user?.id ?? null, ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: req.headers.get("user-agent"), metadata: { status: res.status } },
    }).catch(() => undefined);
  }
  return res;
}
