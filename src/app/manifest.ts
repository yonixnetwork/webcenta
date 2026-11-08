import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getSection } from "@/server/settings/store";

/** Web app manifest from Admin → Settings → PWA & app. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  await connection();
  const c = await getSection("pwa");
  return {
    id: "/",
    name: c.str("appName"),
    short_name: c.str("shortName"),
    description: c.str("description"),
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: c.str("backgroundColor"),
    theme_color: c.str("themeColor"),
    categories: ["productivity", "utilities", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Search apps", url: "/search", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Categories", url: "/categories", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
