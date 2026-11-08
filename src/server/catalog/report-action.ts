"use server";

import { headers } from "next/headers";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";
import { dailySalt, visitorHash } from "@/server/analytics/visitor";
import { createListingReport, listingReportSchema } from "@/server/moderation/reports";
import { publicListingWhere } from "./visibility";
import { getViewerContext } from "@/server/viewer";
import { getCurrentUser } from "@/server/auth/session";

export interface ReportState { ok: boolean; message: string }

export async function submitListingReport(slug: string, _prev: ReportState, form: FormData): Promise<ReportState> {
  if (form.get("website")) return { ok: true, message: "Thank you — your report has been received." }; // honeypot
  const parsed = listingReportSchema.safeParse({ reason: form.get("reason"), details: form.get("details") || undefined });
  if (!parsed.success) return { ok: false, message: "Please choose a reason." };

  const ctx = await getViewerContext();
  const listing = await db.listing.findFirst({ where: { AND: [publicListingWhere(ctx), { slug }] }, select: { id: true } });
  if (!listing) return { ok: false, message: "This listing is no longer available." };

  const h = await headers();
  const who = visitorHash(await dailySalt(), clientIp(h, (await networkSettings()).trustedProxyHops), h.get("user-agent"), "report");
  if (!(await rateLimit(`report:${who}`, 5, 3600))) {
    return { ok: false, message: "Too many reports from this connection. Please try again later." };
  }
  // Signed-in reporters are linked so they can follow the outcome (anonymous reports remain possible).
  const user = await getCurrentUser();
  await createListingReport(listing.id, parsed.data, user?.id ?? null);
  return { ok: true, message: "Thank you — your report has been received and will be reviewed." };
}
