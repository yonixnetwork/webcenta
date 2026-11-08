import { getSection } from "@/server/settings/store";

export const dynamic = "force-dynamic";

/** IndexNow key file (Admin → Settings → Search engines & IndexNow). 404 when no key is set. */
export async function GET() {
  const key = (await getSection("webmaster")).str("indexNowKey");
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
