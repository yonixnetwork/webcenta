import { headers } from "next/headers";
import type { AgeRating } from "@/generated/prisma/enums";
import { env } from "@/lib/env";

export interface ViewerContext {
  /** ISO 3166-1 alpha-2, or null when unknown (best effort; VPNs bypass this). */
  country: string | null;
  /** Highest age rating this viewer may see. Anonymous viewers never see 18+. */
  maxAgeRating: AgeRating;
  unknownCountryPolicy: "allow" | "deny";
}

export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  // Cloudflare uses XX (unknown) and T1 (Tor).
  if (!/^[A-Z]{2}$/.test(v) || v === "XX" || v === "T1") return null;
  return v;
}

export async function getViewerContext(): Promise<ViewerContext> {
  const h = await headers();
  const e = env();
  return {
    country: normalizeCountry(h.get(e.GEO_COUNTRY_HEADER)),
    // Phase 2 adds signed-in preferences; 18+ opt-in requires an account.
    maxAgeRating: "AGE_16_PLUS",
    unknownCountryPolicy: e.GEO_UNKNOWN_POLICY,
  };
}

/** Client IP, honouring only the configured number of trusted proxies. */
export function clientIp(h: Headers, trustedHops: number): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff && trustedHops > 0) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = parts.length - trustedHops;
    const ip = parts[Math.max(0, idx)];
    if (ip) return ip;
  }
  return h.get("x-real-ip");
}
