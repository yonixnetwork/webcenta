import type { NextRequest } from "next/server";
import { suggest } from "@/server/search/search";
import { getViewerContext } from "@/server/viewer";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  const { allowSearch } = await import("@/server/security/bots");
  if (q && !(await allowSearch(request.headers))) return Response.json({ apps: [], categories: [] }, { status: 429, headers: { "retry-after": "60" } });
  const data = await suggest(await getViewerContext(), q);
  // Results depend on the viewer's country; allow only private caching.
  return Response.json(data, { headers: { "cache-control": "private, max-age=30" } });
}
