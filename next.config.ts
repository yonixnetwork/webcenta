import type { NextConfig } from "next";

// Keep this file free of hosting-specific paths. Everything environment-specific
// comes from environment variables (see .env.example and docs/DEPLOYMENT.md).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Self-contained server (.next/standalone/server.js). Hostinger's Node.js hosting
  // runs Next.js this way; `npm start` does the same locally and on a VPS.
  output: "standalone",
  // Native/driver packages stay runtime dependencies rather than being bundled.
  serverExternalPackages: ["mariadb", "@prisma/adapter-mariadb", "sharp"],
  // The build type-checks only the application (tsconfig.build.json): hosting installs
  // production dependencies only, and tests/scripts import dev dependencies.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  experimental: {
    // Build workers. Next.js starts one per CPU it sees (63 on Hostinger's build hosts),
    // which exceeds the account's thread/process limit and aborts the build with
    // "OS can't spawn worker thread". NEXT_BUILD_CPUS overrides the default of 2.
    cpus: Math.max(1, Number(process.env.NEXT_BUILD_CPUS) || 2),
    // Media uploads (logos/screenshots ≤ 6 MB, documents ≤ 10 MB) go through server actions.
    serverActions: { bodySizeLimit: "12mb" },
    // Enables forbidden() so access-denied pages return a real 403 status.
    authInterrupts: true,
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
      // Static error pages (public/errors/*.html) bypass the proxy, so they get their own strict CSP.
      { source: "/errors/:file*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" }, { key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "public, max-age=300" }] },
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
