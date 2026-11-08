import { analyticsConfig } from "@/server/settings/site";

export const dynamic = "force-dynamic";

/** Authorised digital sellers (Admin → Settings → Google AdSense). 404 when AdSense is not set up. */
export async function GET() {
  const a = (await analyticsConfig()).adsense;
  if (!a) return new Response("Not found", { status: 404 });
  const extra = a.adsTxtExtra.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && /^[\x20-\x7e]+$/.test(l));
  const body = [`google.com, pub-${a.publisherId}, DIRECT, f08c47fec0942fa0`, ...extra].join("\n") + "\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
