import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { listingInputSchema } from "./input";
import { approveRevision, decideRevision, setListingStatus, validateRefs } from "./workflow";

/**
 * Bulk moderation of developer and editorial submissions (Admin → Submissions). Every record goes
 * through exactly the same checks and workflow functions as a single decision; selecting "all"
 * never approves a record that would not be approved on its own.
 */
export interface Eligibility { revisionId: string; name: string; eligible: boolean; reason: string | null }

/** Why a submission cannot be approved in bulk (null = eligible). */
export async function approvalEligibility(revisionIds: string[]): Promise<Eligibility[]> {
  const revs = await db.listingRevision.findMany({
    where: { id: { in: revisionIds } },
    include: {
      listing: { select: { id: true, name: true, securityStatus: true, developerId: true, securityAlerts: { where: { status: { in: ["OPEN", "INVESTIGATING"] } }, select: { id: true } }, reports: { where: { status: { in: ["OPEN", "IN_REVIEW"] } }, select: { id: true } } } },
      scans: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { overallVerdict: true } },
    },
  });
  const out: Eligibility[] = [];
  for (const r of revs) {
    const name = (r.data as { name?: string }).name ?? r.listing.name;
    const no = (reason: string) => out.push({ revisionId: r.id, name, eligible: false, reason });
    if (r.status !== "UNDER_REVIEW") { no(r.status === "SUBMITTED" || r.status === "AUTOMATED_CHECKS" ? "automated checks have not finished" : `status ${r.status.toLowerCase().replace(/_/g, " ")}`); continue; }
    const scan = r.scans[0];
    if (!scan) { no("no completed security check"); continue; }
    if (scan.overallVerdict === "FAIL") { no("a security check failed"); continue; }
    if (r.listing.securityStatus === "RESTRICTED") { no("the listing is security-restricted"); continue; }
    if (r.listing.securityAlerts.length) { no("open security alert"); continue; }
    if (r.listing.reports.length) { no("open user report"); continue; }
    const parsed = listingInputSchema.safeParse(r.data);
    if (!parsed.success) { no("incomplete or invalid details"); continue; }
    const input = parsed.data;
    if (!input.logoAssetId || input.description.trim().length < 80) { no("incomplete: needs a logo and a description of at least 80 characters"); continue; }
    try {
      const refs = await validateRefs(input, { orgId: r.listing.developerId ?? undefined, adminId: r.listing.developerId ? undefined : "editorial" });
      if (refs.complianceRequired) { no("the category needs licence evidence: review individually"); continue; }
      if (refs.manualReview) { no("the category always needs individual review"); continue; }
      if (refs.riskTier === "HIGH" || refs.riskTier === "PROHIBITED") { no(`${refs.riskTier.toLowerCase()} risk: review individually`); continue; }
    } catch (e) { no(e instanceof Error ? e.message : "invalid references"); continue; }
    out.push({ revisionId: r.id, name, eligible: true, reason: null });
  }
  return out;
}

export interface BulkModerationResult { done: number; skipped: Array<{ name: string; reason: string }> }

export async function bulkModerate(adminId: string, op: "approve" | "reject" | "info" | "suspend", revisionIds: string[], notes: string, limit = 100): Promise<BulkModerationResult> {
  const r: BulkModerationResult = { done: 0, skipped: [] };
  const ids = revisionIds.slice(0, 500);
  if (op === "approve") {
    for (const e of await approvalEligibility(ids)) {
      if (!e.eligible) { r.skipped.push({ name: e.name, reason: e.reason! }); continue; }
      if (r.done >= limit) { r.skipped.push({ name: e.name, reason: `bulk limit of ${limit} reached` }); continue; }
      try { await approveRevision(e.revisionId, { type: "ADMIN", adminId }, { publish: true, notes: notes || "Approved in bulk review." }); r.done++; }
      catch (err) { r.skipped.push({ name: e.name, reason: err instanceof Error ? err.message : "error" }); }
    }
  } else {
    const revs = await db.listingRevision.findMany({ where: { id: { in: ids } }, include: { listing: { select: { id: true, name: true, status: true } } } });
    for (const rev of revs) {
      const name = (rev.data as { name?: string }).name ?? rev.listing.name;
      try {
        if (op === "suspend") {
          if (rev.listing.status !== "PUBLISHED") { r.skipped.push({ name, reason: "only published listings can be suspended" }); continue; }
          await setListingStatus(rev.listing.id, "SUSPENDED", { type: "ADMIN", adminId }, notes);
        } else {
          if (!["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(rev.status)) { r.skipped.push({ name, reason: `status ${rev.status.toLowerCase()}` }); continue; }
          await decideRevision(rev.id, { type: "ADMIN", adminId }, op === "reject" ? "REJECT" : "INFO_REQUIRED", notes);
        }
        r.done++;
      } catch (err) { r.skipped.push({ name, reason: err instanceof Error ? err.message : "error" }); }
    }
  }
  await audit({ actorType: "ADMIN", adminId, action: `submissions.bulk-${op}`, metadata: { requested: ids.length, done: r.done, skipped: r.skipped.length, revisionIds: ids.slice(0, 200) } });
  return r;
}

/** Revisions waiting for review that are eligible for bulk approval now. */
export async function eligibleRevisionIds(): Promise<string[]> {
  const waiting = await db.listingRevision.findMany({ where: { status: "UNDER_REVIEW" }, select: { id: true }, take: 500 });
  return (await approvalEligibility(waiting.map((w) => w.id))).filter((e) => e.eligible).map((e) => e.revisionId);
}
