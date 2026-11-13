import { adsterraFrameHtml, adsterraUnit, type AdUnit } from "@/server/ads/placements";

export const dynamic = "force-dynamic";

const UNITS: AdUnit[] = ["native", "300x250", "728x90", "468x60", "320x50", "160x600"];

/**
 * One Adsterra unit in its own document, embedded by <AdSlot> in an <iframe sandbox>.
 * Its own Content Security Policy allows the ad network (which loads further scripts and
 * frames from changing hosts); the frame has no access to Webcenta's pages or cookies, and the
 * page's own strict policy is unchanged. Only units configured in Settings → Adsterra exist.
 */
export async function GET(request: Request, { params }: { params: Promise<{ unit: string }> }) {
  const { unit } = await params;
  if (!UNITS.includes(unit as AdUnit)) return new Response("Not found", { status: 404 });
  const u = await adsterraUnit(unit as AdUnit).catch(() => null);
  if (!u) return new Response("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  const origin = (process.env.PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "");
  return new Response(adsterraFrameHtml(u, origin), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline'; img-src https: data: blob:; media-src https:; font-src https: data:; frame-src https:; connect-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "x-frame-options": "SAMEORIGIN",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=300",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}
