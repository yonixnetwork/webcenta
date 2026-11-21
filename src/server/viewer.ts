import { headers } from "next/headers";
import type { AgeRating } from "@/generated/prisma/enums";
import { getSection } from "@/server/settings/store";
import { ageOn, minRating, ratingForAge } from "@/lib/age";
import { getCurrentUser } from "@/server/auth/session";
import { combineRules, countryRules } from "@/server/geo/country-policy";

export interface ViewerContext {
  /** ISO 3166-1 alpha-2, or null when unknown (best effort; VPNs bypass this). */
  country: string | null;
  /** Highest age rating this viewer may see. Anonymous viewers never see 18+. */
  maxAgeRating: AgeRating;
  unknownCountryPolicy: "allow" | "deny";
  /** Category slugs hidden by Admin → Country policies for this visitor (detected and chosen country combined). */
  blockedCategorySlugs?: string[];
}

/**
 * Highest rating a viewer may see. Visitors who are not signed in: 16+. Signed-in users: their
 * own preference, capped by the age their date of birth gives (age of majority by country for
 * 18+). Without a date of birth, 18+ also needs the earlier self-confirmation. Self-declared
 * data; this is not age verification.
 */
export function viewerMaxRating(user: { maxAgeRating: AgeRating; adultConfirmedAt: Date | null; birthDate?: Date | null; preferredCountry?: string | null } | null, country: string | null, now = new Date(), adultAge: number | null = null): AgeRating {
  if (!user) return "AGE_16_PLUS";
  if (user.birthDate) {
    const age = ageOn(user.birthDate, now);
    // The stricter of the detected and the chosen country: choosing a country never lowers the age of majority.
    let rating = minRating(ratingForAge(age, country), ratingForAge(age, normalizeCountry(user.preferredCountry)));
    if (adultAge && age < adultAge) rating = minRating(rating, "AGE_16_PLUS");
    return minRating(user.maxAgeRating, rating);
  }
  return user.maxAgeRating === "AGE_18_PLUS" && !user.adultConfirmedAt ? "AGE_16_PLUS" : user.maxAgeRating;
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

export interface CountryInfo {
  /** From the request (CDN country header); null when unknown. Never stored. */
  detected: string | null;
  /** Chosen by the user in their settings (optional). */
  chosen: string | null;
  /** For regional display (currency, recommendations): the choice, else the detected country. */
  region: string | null;
}

export async function viewerCountry(): Promise<CountryInfo> {
  const [h, e, user] = await Promise.all([headers(), networkSettings(), getCurrentUser()]);
  const detected = normalizeCountry(h.get(e.geoCountryHeader));
  const chosen = normalizeCountry(user?.preferredCountry);
  return { detected, chosen, region: chosen ?? detected };
}

export async function getViewerContext(): Promise<ViewerContext> {
  const e = await networkSettings();
  const user = await getCurrentUser();
  const { detected, chosen } = await viewerCountry();
  // Legal restrictions use the detected country; the chosen one is used only when nothing is
  // detected. Country policies of BOTH apply (restrictions only add up).
  const country = detected ?? chosen;
  const rule = combineRules(await countryRules(), [detected, chosen]);
  return {
    country,
    maxAgeRating: viewerMaxRating(user, country, new Date(), rule.adultAge),
    unknownCountryPolicy: e.geoUnknownPolicy,
    blockedCategorySlugs: rule.restrictedCategories,
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
