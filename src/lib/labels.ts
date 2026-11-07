import type { AgeRating, DeveloperVerificationLevel, Platform, PricingModel, SecurityStatus } from "@/generated/prisma/enums";

export const PRICING_LABEL: Record<PricingModel, string> = {
  FREE: "Free", FREEMIUM: "Freemium", PAID: "Paid", SUBSCRIPTION: "Subscription",
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  WEB: "Web", ANDROID: "Android", IOS: "iOS", WINDOWS: "Windows", MACOS: "macOS", LINUX: "Linux", BROWSER_EXTENSION: "Browser extension",
};

export const AGE_LABEL: Record<AgeRating, string> = {
  ALL_AGES: "All ages", AGE_13_PLUS: "13+", AGE_16_PLUS: "16+", AGE_18_PLUS: "18+",
};

/** Honest wording: a scan never means "guaranteed safe". */
export const SECURITY_LABEL: Record<SecurityStatus, { label: string; detail: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  NOT_SCANNED: { label: "Not yet scanned", detail: "Automated security checks have not run for this listing yet.", tone: "neutral" },
  PASSED: { label: "No issues detected", detail: "Our automated checks found no issues at the last scan. This is not a guarantee of safety.", tone: "success" },
  WARNING: { label: "Warning", detail: "Automated checks raised a warning. Proceed with care.", tone: "warning" },
  UNDER_INVESTIGATION: { label: "Under investigation", detail: "Our team is reviewing a reported or detected issue.", tone: "warning" },
  RESTRICTED: { label: "Restricted", detail: "This listing is restricted pending review.", tone: "danger" },
};

export const VERIFICATION_LABEL: Record<DeveloperVerificationLevel, string> = {
  UNVERIFIED: "Developer not verified",
  DOMAIN_VERIFIED: "Domain verified",
  BUSINESS_VERIFIED: "Business verified",
};

export function isSampleListing(slug: string): boolean {
  return slug.startsWith("sample-");
}

export function formatDate(d: Date | null | undefined): string {
  return d ? new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(d) : "—";
}
