import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSection } from "@/server/settings/store";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  // Admin → Settings → Branding & SEO → "Allow search engines" (off for staging).
  if (!(await getSection("seo")).bool("allowIndexing")) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/go/", "/api/", "/search"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
