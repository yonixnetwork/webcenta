import { headers } from "next/headers";
import type { AgeRating } from "@/generated/prisma/enums";
import { getSection } from "@/server/settings/store";
import { getCurrentUser } from "@/server/auth/session";

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

/** Proxy and country-detection settings (Admin → Settings → Security, or env). */
export async function networkSettings(): Promise<{ trustedProxyHops: number; geoCountryHeader: string; geoUnknownPolicy: "allow" | "deny" }> {
  const c = await getSection("security");
  return {
    trustedProxyHops: Math.max(0, Math.min(5, c.num("trustedProxyHops"))),
    geoCountryHeader: c.str("geoCountryHeader").toLowerCase() || "cf-ipcountry",
    geoUnknownPolicy: c.str("geoUnknownPolicy") === "allow" ? "allow" : "deny",
  };
}

export async function getViewerContext(): Promise<ViewerContext> {
  const h = await headers();
  const e = await networkSettings();
  const user = await getCurrentUser();
  // 18+ content requires a signed-in user who chose it and self-confirmed their age.
  // This is a self-declaration, not age verification.
  const maxAgeRating: AgeRating = user ? (user.maxAgeRating === "AGE_18_PLUS" && !user.adultConfirmedAt ? "AGE_16_PLUS" : user.maxAgeRating) : "AGE_16_PLUS";
  return {
    // The detected country takes precedence for legal restrictions; a user's stated
    // country is only used when nothing is detected.
    country: normalizeCountry(h.get(e.geoCountryHeader)) ?? normalizeCountry(user?.preferredCountry),
    maxAgeRating,
    unknownCountryPolicy: e.geoUnknownPolicy,
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
