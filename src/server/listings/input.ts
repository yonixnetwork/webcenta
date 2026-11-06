import { z } from "zod";
import { normalizeWebsiteUrl } from "@/lib/url";
import { PLATFORMS, PRICING } from "@/lib/search-params";

const optionalUrl = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.string().trim().max(500).refine((u) => normalizeWebsiteUrl(u) !== null, "Must be an https:// URL").optional());
const list = (max: number, itemMax: number) => z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : []),
  z.array(z.string().trim().max(itemMax)).transform((a) => [...new Set(a.filter(Boolean))].slice(0, max)),
);

/** Content of a listing revision (developer submission or editorial listing). */
export const listingInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(140).optional().transform((v) => v || undefined),
  description: z.string().trim().min(30, "Please describe the app in at least 30 characters").max(5000),
  features: list(12, 80),
  websiteUrl: z.string().trim().max(500).refine((u) => normalizeWebsiteUrl(u) !== null, "Must be an https:// URL on a public domain"),
  privacyPolicyUrl: optionalUrl,
  termsUrl: optionalUrl,
  supportUrl: optionalUrl,
  publisherName: z.string().trim().min(2).max(120),
  publisherUrl: optionalUrl,
  primaryCategoryId: z.string().min(1, "Choose a category"),
  categoryIds: list(4, 64),
  tags: list(10, 32),
  pricingModel: z.enum(PRICING),
  pricingDetails: z.string().trim().max(200).optional().transform((v) => v || undefined),
  isOpenSource: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  sourceCodeUrl: optionalUrl,
  platforms: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : ["WEB"]), z.array(z.enum(PLATFORMS)).min(1)),
  isBrowserBased: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  isMobileFriendly: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  isPwaInstallable: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
  ageRating: z.enum(["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"]),
  supportedCountries: list(250, 2).transform((a) => a.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))),
  languages: list(20, 8).transform((a) => a.map((c) => c.toLowerCase())),
  logoAssetId: z.string().optional().transform((v) => v || undefined),
  screenshotAssetIds: list(8, 64),
});

export type ListingInput = z.infer<typeof listingInputSchema>;

/** Reads the listing form fields from FormData (arrays from repeated fields). */
export function formToListingInput(form: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const key of ["name", "tagline", "description", "features", "websiteUrl", "privacyPolicyUrl", "termsUrl", "supportUrl", "publisherName", "publisherUrl",
    "primaryCategoryId", "tags", "pricingModel", "pricingDetails", "isOpenSource", "sourceCodeUrl", "isBrowserBased", "isMobileFriendly", "isPwaInstallable",
    "ageRating", "supportedCountries", "languages", "logoAssetId"]) {
    const v = form.get(key);
    if (v !== null) o[key] = typeof v === "string" ? v : undefined;
  }
  o.categoryIds = form.getAll("categoryIds").map(String);
  o.platforms = form.getAll("platforms").map(String);
  o.screenshotAssetIds = form.getAll("screenshotAssetIds").map(String);
  return o;
}
