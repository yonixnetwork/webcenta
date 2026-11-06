import type { NextConfig } from "next";

// Keep this file free of hosting-specific paths. Everything environment-specific
// comes from environment variables (see .env.example and docs/DEPLOYMENT.md).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // node-postgres must stay a runtime dependency rather than being bundled.
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "sharp"],
  experimental: {
    // Media uploads (logos/screenshots ≤ 6 MB, documents ≤ 10 MB) go through server actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    // Listing media is served from object storage; the host is configured via env.
    remotePatterns: process.env.MEDIA_PUBLIC_BASE_URL
      ? [new URL(`${process.env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/**`)]
      : [],
  },
  async headers() {
    // Headers that do not depend on the request. CSP (with a per-request nonce)
    // is set in src/proxy.ts.
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
