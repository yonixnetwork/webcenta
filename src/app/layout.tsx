import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { siteInfo } from "@/server/settings/site";
import "./globals.css";

/** Site-wide metadata from Admin → Settings (General, Branding & SEO, Search engines). */
export async function generateMetadata(): Promise<Metadata> {
  const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
  const s = await siteInfo();
  const other: Record<string, string> = {};
  if (s.verification.bing) other["msvalidate.01"] = s.verification.bing;
  return {
    metadataBase: new URL(origin),
    title: { default: s.defaultTitle, template: `%s · ${s.name}` },
    description: s.description || undefined,
    applicationName: s.name,
    // Default social preview: the official logo (public/brand/og-default.png) unless one is set in Settings.
    openGraph: { siteName: s.name, type: "website", images: [{ url: s.ogImageUrl || "/brand/og-default.png", width: 1200, height: 630, alt: s.name }] },
    twitter: { card: "summary_large_image", ...(s.twitterHandle ? { site: `@${s.twitterHandle}` } : {}), images: [s.ogImageUrl || "/brand/og-default.png"] },
    appleWebApp: { capable: true, title: s.name, statusBarStyle: "default" },
    icons: {
      icon: [16, 32, 48].map((n) => ({ url: `/icons/favicon-${n}.png`, sizes: `${n}x${n}`, type: "image/png" })),
      apple: "/icons/apple-touch-icon.png",
    },
    ...(s.allowIndexing ? {} : { robots: { index: false, follow: false } }),
    verification: {
      ...(s.verification.google ? { google: s.verification.google } : {}),
      ...(s.verification.yandex ? { yandex: s.verification.yandex } : {}),
      ...(Object.keys(other).length ? { other } : {}),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c11" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("wc-theme")?.value;
  const themeClass = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="en" className={themeClass}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
