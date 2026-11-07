import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { publicListingWhere } from "@/server/catalog/visibility";
import { normalizeWebsiteUrl } from "@/lib/url";
import { parseSurface, recordOutboundClick } from "@/server/analytics/outbound";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";
import { recordInteraction } from "@/server/personalization/signals";

/**
 * Tracked outbound redirect. The destination is ALWAYS the listing's stored
 * websiteUrl — never a request parameter — so this cannot be an open redirect.
 * POST-only so link prefetchers and crawlers do not inflate click counts.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await db.listing.findFirst({
    where: { AND: [publicListingWhere(await getViewerContext()), { slug }] },
    select: { id: true, websiteUrl: true },
  });
  const target = listing && normalizeWebsiteUrl(listing.websiteUrl);
  if (!listing || !target) return new NextResponse("Not found", { status: 404 });

  const form = await request.formData().catch(() => null);
  try {
    const counted = await recordOutboundClick(listing.id, request.headers, parseSurface(form?.get("surface")));
    const user = await getCurrentUser();
    if (user && counted) await recordInteraction(user.id, { type: "OUTBOUND_CLICK", listingId: listing.id });
  } catch (err) {
    // Never block the user's navigation because analytics failed.
    console.error("outbound click not recorded", err);
  }
  const res = NextResponse.redirect(target.toString(), 303);
  res.headers.set("cache-control", "no-store");
  return res;
}

export function GET(request: NextRequest) {
  // Direct GETs (e.g. pasted links) go back to the interstitial.
  return NextResponse.redirect(new URL(request.nextUrl.pathname.replace(/\/continue$/, ""), request.url), 303);
}
