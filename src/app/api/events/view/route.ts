import { z } from "zod";
import { db } from "@/server/db";
import { getViewerContext } from "@/server/viewer";
import { publicListingWhere } from "@/server/catalog/visibility";
import { isListingTeam, isSameOrigin, recordListingEvent, referrerHost } from "@/server/analytics/events";
import { getCurrentUser } from "@/server/auth/session";
import { recordInteraction } from "@/server/personalization/signals";
import { parseSurface } from "@/server/analytics/outbound";

const body = z.object({ slug: z.string().max(80), surface: z.string().max(20).optional() });

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const listing = await db.listing.findFirst({ where: { AND: [publicListingWhere(await getViewerContext()), { slug: parsed.data.slug }] }, select: { id: true } });
  if (!listing) return new Response(null, { status: 404 });
  const user = await getCurrentUser();
  if (await isListingTeam(listing.id, user?.id)) return Response.json({ recorded: false }, { headers: { "cache-control": "no-store" } });
  const stored = await recordListingEvent(listing.id, "VIEW", req.headers, { surface: parseSurface(parsed.data.surface), referrer: referrerHost(req.headers) });
  if (user && stored) await recordInteraction(user.id, { type: "LISTING_VIEW", listingId: listing.id });
  return Response.json({ recorded: stored }, { headers: { "cache-control": "no-store" } });
}
