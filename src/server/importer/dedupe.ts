import { db } from "@/server/db";
import { registrableDomain } from "@/server/scanner/domains";

/**
 * Duplicate detection for automatic imports. Different spellings of one website (www., an
 * http:// address, a trailing path, upper case) all reduce to the same canonical host, and a
 * site is a duplicate of an existing listing when either is the other's registrable domain or
 * the same host. Subdomains of shared hosting platforms (e.g. *.vercel.app) are distinct apps.
 */
const SHARED_HOSTS = new Set(["vercel.app", "netlify.app", "github.io", "pages.dev", "web.app", "firebaseapp.com", "herokuapp.com", "glitch.me", "onrender.com", "fly.dev", "replit.app", "streamlit.app", "hf.space", "notion.site", "webflow.io", "framer.website", "wixsite.com", "blogspot.com", "wordpress.com"]);

export function canonicalHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "").replace(/^www\d?\./, "");
}

/** Hosts that would identify the same website as `host`. */
export function equivalentHosts(host: string): string[] {
  const h = canonicalHost(host);
  const reg = registrableDomain(h);
  const out = new Set([h, `www.${h}`]);
  // Only collapse to the registrable domain when it is not a shared hosting platform.
  if (!SHARED_HOSTS.has(reg)) { out.add(reg); out.add(`www.${reg}`); }
  return [...out];
}

export interface Duplicate { kind: "listing" | "import"; id: string; name: string; status: string }

/** An existing listing or another import for the same website, if any. */
export async function findDuplicate(host: string, exceptCandidateId?: string): Promise<Duplicate | null> {
  const hosts = equivalentHosts(host);
  const listing = await db.listing.findFirst({
    where: { domain: { in: hosts }, status: { not: "REMOVED" }, deletedAt: null },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  if (listing) return { kind: "listing", id: listing.id, name: listing.name, status: listing.status };
  const other = await db.importCandidate.findFirst({
    where: { domain: { in: hosts }, status: { in: ["QUEUED", "IMPORTING", "IMPORTED"] }, ...(exceptCandidateId ? { id: { not: exceptCandidateId } } : {}) },
    select: { id: true, name: true, domain: true, status: true },
    orderBy: { createdAt: "asc" },
  });
  return other ? { kind: "import", id: other.id, name: other.name ?? other.domain, status: other.status } : null;
}

/** Scheduled job "imports.dedupe": queued imports for websites already listed or queued earlier are skipped. */
export async function skipQueuedDuplicates(limit = 5000): Promise<{ checked: number; skipped: number }> {
  // The whole queue, in pages (the catalogue can queue hundreds of websites at once).
  const queued: Array<{ id: string; domain: string; createdAt: Date }> = [];
  for (let cursor: string | undefined; queued.length < limit;) {
    const page = await db.importCandidate.findMany({ where: { status: "QUEUED" }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, domain: true, createdAt: true } });
    queued.push(...page);
    if (page.length < 500) break;
    cursor = page[page.length - 1]!.id;
  }
  let skipped = 0;
  for (const c of queued) {
    const d = await findDuplicate(c.domain, c.id);
    // An older queued twin keeps its place; only the later one is skipped.
    if (!d || (d.kind === "import" && d.status === "QUEUED" && (await db.importCandidate.findUnique({ where: { id: d.id }, select: { createdAt: true } }))!.createdAt > c.createdAt)) continue;
    await db.importCandidate.update({ where: { id: c.id }, data: { status: "SKIPPED", processedAt: new Date(), failedStage: "duplicate", errorCategory: "duplicate", retryable: false, duplicateOfListingId: d.kind === "listing" ? d.id : null, lastError: d.kind === "listing" ? `Already listed as "${d.name}" (${d.status.toLowerCase()}).` : `Already in the import queue as "${d.name}" (${d.status.toLowerCase()}).` } });
    skipped++;
  }
  return { checked: queued.length, skipped };
}

/** A published or pending listing for the same website other than `listingId` (blocks publishing a duplicate). */
export async function otherListingFor(listingId: string, host: string) {
  return db.listing.findFirst({
    where: { id: { not: listingId }, domain: { in: equivalentHosts(host) }, status: { in: ["PUBLISHED", "APPROVED", "SUSPENDED"] }, deletedAt: null },
    select: { id: true, name: true, status: true },
  });
}
