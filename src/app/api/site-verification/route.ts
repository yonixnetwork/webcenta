import { getSection } from "@/server/settings/store";

export const dynamic = "force-dynamic";

/**
 * Search engine ownership files (Admin → Settings → Search engines & IndexNow). The proxy rewrites
 * /google<hex>.html and /BingSiteAuth.xml here; only the exact configured file exists.
 */
export async function GET(request: Request) {
  const f = new URL(request.url).searchParams.get("f") ?? "";
  const w = await getSection("webmaster");
  if (f === "BingSiteAuth.xml") {
    const code = w.str("bingAuthCode");
    if (!/^[A-Za-z0-9]{16,64}$/.test(code)) return new Response("Not found", { status: 404 });
    return new Response(`<?xml version="1.0"?>\n<users>\n\t<user>${code}</user>\n</users>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
  }
  const file = w.str("googleVerificationFile");
  if (!file || f !== file || !/^google[0-9a-f]{8,32}\.html$/.test(file)) return new Response("Not found", { status: 404 });
  return new Response(`google-site-verification: ${file}`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
