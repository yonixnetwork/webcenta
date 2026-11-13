import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { approveRevision, decideRevision, setListingStatus } from "@/server/listings/workflow";
import { getSection } from "@/server/settings/store";
import { importCandidate } from "./importer";

/**
 * Bulk moderation of imported web apps (Admin → Import web apps). Every action goes through the
 * normal workflow functions, so status history, moderation records and audit entries are kept.
 */
export interface BulkResult { done: number; skipped: Array<{ name: string; reason: string }> }

interface Pending { listingId: string; revisionId: string; name: string; scanVerdict: string | null; compliance: boolean }

/** Imported listings waiting for review, with what bulk publishing needs to know. */
async function pendingFor(candidateIds?: string[]): Promise<Pending[]> {
  const cands = await db.importCandidate.findMany({ where: { status: "IMPORTED", listingId: { not: null }, ...(candidateIds ? { id: { in: candidateIds } } : {}) }, select: { listingId: true } });
  const listings = await db.listing.findMany({
    where: { id: { in: cands.map((c) => c.listingId!) }, deletedAt: null },
    select: {
      id: true, name: true,
      revisions: { where: { status: { in: ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"] } }, orderBy: { revisionNumber: "desc" }, take: 1, select: { id: true } },
      scans: { where: { status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 1, select: { overallVerdict: true } },
      categories: { select: { category: { select: { requiresComplianceDocs: true, parent: { select: { requiresComplianceDocs: true } } } } } },
    },
  });
  return listings.filter((l) => l.revisions[0]).map((l) => ({
    listingId: l.id, revisionId: l.revisions[0]!.id, name: l.name, scanVerdict: l.scans[0]?.overallVerdict ?? null,
    compliance: l.categories.some((c) => c.category.requiresComplianceDocs || c.category.parent?.requiresComplianceDocs),
  }));
}

/** Why a pending import may not be published in bulk (null = eligible). */
function ineligible(p: Pending): string | null {
  if (!p.scanVerdict) return "security checks have not finished";
  if (p.scanVerdict === "FAIL") return "a security check failed";
  if (p.compliance) return "the category needs licence evidence: review it individually";
  return null;
}

export async function bulkPublish(adminId: string, candidateIds: string[] | "all"): Promise<BulkResult> {
  const limit = Math.max(1, (await getSection("imports")).num("bulkLimit") || 100);
  const pending = await pendingFor(candidateIds === "all" ? undefined : candidateIds);
  const r: BulkResult = { done: 0, skipped: [] };
  for (const p of pending) {
    const why = ineligible(p);
    if (why) { r.skipped.push({ name: p.name, reason: why }); continue; }
    if (r.done >= limit) { r.skipped.push({ name: p.name, reason: `bulk limit of ${limit} reached` }); continue; }
    try {
      await approveRevision(p.revisionId, { type: "ADMIN", adminId }, { publish: true, notes: "Published in bulk review of imported apps." });
      r.done++;
    } catch (e) { r.skipped.push({ name: p.name, reason: e instanceof Error ? e.message : "error" }); }
  }
  await audit({ actorType: "ADMIN", adminId, action: "imports.bulk-publish", metadata: { published: r.done, skipped: r.skipped.length } });
  return r;
}

/** Rejects pending imports; published ones are archived (removed from the marketplace). */
export async function bulkReject(adminId: string, candidateIds: string[], mode: "reject" | "archive"): Promise<BulkResult> {
  const r: BulkResult = { done: 0, skipped: [] };
  const cands = await db.importCandidate.findMany({ where: { id: { in: candidateIds }, status: "IMPORTED", listingId: { not: null } }, select: { listingId: true } });
  const pending = new Map((await pendingFor(candidateIds)).map((p) => [p.listingId, p]));
  for (const c of cands) {
    const l = await db.listing.findUnique({ where: { id: c.listingId! }, select: { id: true, name: true, status: true } });
    if (!l) continue;
    try {
      const p = pending.get(l.id);
      if (p) await decideRevision(p.revisionId, { type: "ADMIN", adminId }, "REJECT", mode === "archive" ? "Archived in bulk review of imported apps." : "Not published after review of imported apps.");
      else if (l.status === "PUBLISHED" || l.status === "SUSPENDED") await setListingStatus(l.id, "REMOVED", { type: "ADMIN", adminId }, "Archived in bulk review of imported apps.");
      else { r.skipped.push({ name: l.name, reason: `status ${l.status.toLowerCase()}` }); continue; }
      r.done++;
    } catch (e) { r.skipped.push({ name: l.name, reason: e instanceof Error ? e.message : "error" }); }
  }
  await audit({ actorType: "ADMIN", adminId, action: `imports.bulk-${mode}`, metadata: { done: r.done, skipped: r.skipped.length } });
  return r;
}

/** Moves pending imports (not yet published) to another category before review. */
export async function bulkCategory(adminId: string, candidateIds: string[], categoryId: string): Promise<BulkResult> {
  const cat = await db.category.findFirst({ where: { id: categoryId, isEnabled: true, mergedIntoId: null }, select: { id: true, slug: true, defaultAgeRating: true } });
  if (!cat) return { done: 0, skipped: [{ name: "—", reason: "category not found" }] };
  const r: BulkResult = { done: 0, skipped: [] };
  for (const p of await pendingFor(candidateIds)) {
    const rev = await db.listingRevision.findUnique({ where: { id: p.revisionId }, select: { data: true } });
    const data = { ...(rev?.data as Record<string, unknown>), primaryCategoryId: cat.id, categoryIds: [], ageRating: cat.defaultAgeRating };
    await db.listingRevision.update({ where: { id: p.revisionId }, data: { data } });
    await db.listing.update({ where: { id: p.listingId }, data: { primaryCategoryId: cat.id } });
    await db.importCandidate.updateMany({ where: { listingId: p.listingId }, data: { categorySlug: cat.slug } });
    r.done++;
  }
  await audit({ actorType: "ADMIN", adminId, action: "imports.bulk-category", metadata: { categoryId, done: r.done } });
  return r;
}

/** Queued candidates: import a few now, exclude, or require review. */
export async function bulkQueue(adminId: string, candidateIds: string[], op: "import" | "exclude" | "review"): Promise<BulkResult> {
  const r: BulkResult = { done: 0, skipped: [] };
  if (op === "exclude") r.done = (await db.importCandidate.updateMany({ where: { id: { in: candidateIds }, status: { in: ["QUEUED", "FAILED"] } }, data: { status: "SKIPPED", processedAt: new Date() } })).count;
  if (op === "review") r.done = (await db.importCandidate.updateMany({ where: { id: { in: candidateIds } }, data: { reviewRequired: true } })).count;
  if (op === "import") {
    // Each import fetches a website; a handful per request keeps within hosting time limits.
    for (const id of candidateIds.slice(0, 5)) {
      await db.importCandidate.updateMany({ where: { id, status: { in: ["QUEUED", "FAILED"] } }, data: { status: "QUEUED", attempts: 0, createdByAdminId: adminId } });
      const out = await importCandidate(id);
      if (out.status === "IMPORTED") r.done++; else r.skipped.push({ name: id, reason: out.reason });
    }
    if (candidateIds.length > 5) r.skipped.push({ name: `${candidateIds.length - 5} more`, reason: "at most 5 per action; the rest stay queued" });
  }
  await audit({ actorType: "ADMIN", adminId, action: `imports.bulk-${op}`, metadata: { count: candidateIds.length, done: r.done } });
  return r;
}

/** Puts failed (or skipped) imports back in the queue; "all" = every retryable failure. */
export async function bulkRetry(adminId: string, candidateIds: string[] | "all"): Promise<BulkResult> {
  const where = candidateIds === "all" ? { status: "FAILED" as const, retryable: true } : { id: { in: candidateIds }, status: { in: ["FAILED" as const, "SKIPPED" as const] } };
  const r = await db.importCandidate.updateMany({ where, data: { status: "QUEUED", attempts: 0, lastError: null, failedStage: null, errorCategory: null, retryable: true, createdByAdminId: adminId } });
  await audit({ actorType: "ADMIN", adminId, action: "imports.bulk-retry", metadata: { done: r.count, scope: candidateIds === "all" ? "all-failed" : "selected" } });
  return { done: r.count, skipped: [] };
}

/**
 * Runs the automated security checks now for selected imports that are still waiting for them
 * (normally the scheduler does this a few minutes after import). Checks fetch the website, so a
 * few per action keep within hosting time limits.
 */
export async function bulkChecks(adminId: string, candidateIds: string[]): Promise<BulkResult> {
  const { processSubmission } = await import("@/server/listings/workflow");
  const r: BulkResult = { done: 0, skipped: [] };
  const cands = await db.importCandidate.findMany({ where: { id: { in: candidateIds }, listingId: { not: null } }, select: { listingId: true, domain: true } });
  for (const c of cands.slice(0, 3)) {
    // A check interrupted long ago (e.g. a crashed run) can be started again.
    await db.listingRevision.updateMany({ where: { listingId: c.listingId!, status: "AUTOMATED_CHECKS", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, data: { status: "SUBMITTED" } });
    const rev = await db.listingRevision.findFirst({ where: { listingId: c.listingId!, status: "SUBMITTED" }, orderBy: { revisionNumber: "desc" }, select: { id: true } });
    if (!rev) { r.skipped.push({ name: c.domain, reason: "checks already done or running" }); continue; }
    try {
      const out = await processSubmission(rev.id);
      if ("skipped" in out) r.skipped.push({ name: c.domain, reason: "already being checked" });
      else r.done++;
    } catch (e) { r.skipped.push({ name: c.domain, reason: `checks failed: ${e instanceof Error ? e.message : "error"}` }); }
  }
  if (cands.length > 3) r.skipped.push({ name: `${cands.length - 3} more`, reason: "at most 3 per action; the scheduler checks the rest" });
  await audit({ actorType: "ADMIN", adminId, action: "imports.bulk-checks", metadata: { done: r.done, skipped: r.skipped.length } });
  return r;
}

/** How many pending imports bulk publishing would publish now (for the confirmation). */
export async function eligibleCount(): Promise<number> {
  return (await pendingFor()).filter((p) => !ineligible(p)).length;
}
