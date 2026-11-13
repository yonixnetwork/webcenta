import type { CheckOutcome } from "@/server/scanner/scan";
import { riskScore } from "@/server/scanner/scan";

/**
 * Risk-based publishing of automatic imports. Publishing needs every rule to hold; otherwise the
 * listing waits in the review queue and the reasons are recorded in the audit log. Being reachable
 * is never treated as proof that a website is legitimate.
 */
export interface ImportPolicy { autoPublish: boolean; maxRiskScore: number; eligibleCategories: string[]; reviewCategories: string[] }
export interface ImportContext {
  outcomes: CheckOutcome[];
  categorySlugs: string[]; // the listing's categories and their parents
  manualReview: boolean;   // a category needs a moderator (finance, crypto, adult, medical…)
  complianceRequired: boolean;
  tierAllowsAuto: boolean;
  reviewRequired: boolean; // "Send for review" in Admin → Import web apps
  openReports: number;
  hasLogo: boolean;
  descriptionLength: number;
}

export const slugList = (v: string) => v.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

export function importDecision(p: ImportPolicy, c: ImportContext): { publish: boolean; score: number; reasons: string[] } {
  const score = riskScore(c.outcomes);
  const reasons: string[] = [];
  if (!p.autoPublish) reasons.push("automatic publishing is off");
  if (c.reviewRequired) reasons.push("sent for review by an administrator");
  if (c.outcomes.some((o) => o.verdict === "FAIL")) reasons.push(`failed checks: ${c.outcomes.filter((o) => o.verdict === "FAIL").map((o) => o.check).join(", ")}`);
  const external = c.outcomes.some((o) => (o.check === "THREAT_INTEL_URL" || (o.check === "THREAT_INTEL_DOMAIN" && o.provider !== "webcenta-blocklist")) && o.verdict === "PASS");
  if (!external) reasons.push("no external malware/phishing source checked the site");
  if (score > p.maxRiskScore) reasons.push(`risk score ${score} is above the threshold ${p.maxRiskScore}`);
  if (c.manualReview || c.complianceRequired) reasons.push("the category always needs a moderator");
  if (!c.tierAllowsAuto) reasons.push("the category's risk tier does not allow automatic approval");
  const review = c.categorySlugs.filter((s) => p.reviewCategories.includes(s));
  if (review.length) reasons.push(`category ${review.join(", ")} always needs review`);
  if (p.eligibleCategories.length && !c.categorySlugs.some((s) => p.eligibleCategories.includes(s))) reasons.push("the category is not enabled for automatic publishing");
  if (c.openReports) reasons.push("open user reports");
  if (!c.hasLogo) reasons.push("no logo found on the website");
  if (c.descriptionLength < 60) reasons.push("the website gives too little information about itself");
  return { publish: reasons.length === 0, score, reasons };
}
