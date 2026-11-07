import { z } from "zod";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { recordInteraction } from "@/server/personalization/signals";

const body = z.object({ slug: z.string().max(80), dwellMs: z.number().int().min(0).max(3_600_000) });

/** Dwell time is only used as a personalisation signal for signed-in users. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.dwellMs < 15_000) return new Response(null, { status: 204 });
  const l = await db.listing.findUnique({ where: { slug: parsed.data.slug }, select: { id: true, status: true } });
  if (l?.status === "PUBLISHED") await recordInteraction(user.id, { type: "LISTING_DWELL", listingId: l.id, dwellMs: parsed.data.dwellMs });
  return new Response(null, { status: 204 });
}
