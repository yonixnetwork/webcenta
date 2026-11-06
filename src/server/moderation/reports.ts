import { z } from "zod";
import { db } from "@/server/db";

/** Reasons a visitor may choose when reporting a listing. */
export const LISTING_REPORT_REASONS = [
  ["SCAM_OR_FRAUD", "Scam or fraud"],
  ["PHISHING", "Phishing or credential theft"],
  ["MALWARE", "Malware or dangerous downloads"],
  ["SUSPICIOUS_REDIRECT", "Suspicious redirects"],
  ["IMPERSONATION", "Impersonates another brand or person"],
  ["COPYRIGHT", "Copyright or trademark complaint"],
  ["ILLEGAL_CONTENT", "Illegal content or service"],
  ["MISLEADING", "Misleading or incorrect listing"],
  ["BROKEN_OR_UNAVAILABLE", "Website broken or unavailable"],
  ["OTHER", "Other"],
] as const;

export const listingReportSchema = z.object({
  reason: z.enum(LISTING_REPORT_REASONS.map(([v]) => v) as [string, ...string[]]),
  details: z.string().trim().max(2000).optional(),
});

/** Stores an anonymous listing report. Reports are reviewed in the admin portal (Phase 3). */
export async function createListingReport(listingId: string, input: z.infer<typeof listingReportSchema>) {
  return db.report.create({
    data: {
      targetType: "LISTING",
      listingId,
      reason: input.reason as never,
      details: input.details || null,
    },
    select: { id: true },
  });
}
