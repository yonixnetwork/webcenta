import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
  return {
    metadataBase: new URL(origin),
    title: { default: "Webcenta — Discover the best web apps", template: "%s · Webcenta" },
    description: "Discover, compare and safely visit websites, web apps, AI tools and online services from around the world.",
    applicationName: "Webcenta",
    openGraph: { siteName: "Webcenta", type: "website" },
    twitter: { card: "summary_large_image" },
    appleWebApp: { capable: true, title: "Webcenta", statusBarStyle: "default" },
    icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
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
