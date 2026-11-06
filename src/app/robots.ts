import type { MetadataRoute } from "next";
import { connection } from "next/server";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/go/", "/api/", "/search"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
