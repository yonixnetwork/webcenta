import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { normalizeWebsiteUrl } from "@/lib/url";
import { safeFetch } from "@/server/scanner/safe-fetch";
import { findDuplicate } from "./dedupe";
import { storeImageBytes } from "@/server/storage/uploads";
import { createEditorialListing } from "@/server/listings/workflow";
import { getSection } from "@/server/settings/store";
import { parseManifest, parseSiteHtml } from "./metadata";

/**
 * Automatic import of web apps. A candidate (a URL and a category) becomes an editorial
 * listing with the name, description, logo and screenshots the website publishes about
 * itself (HTML metadata and web app manifest) plus, optionally, a screenshot captured by
 * WordPress.com mShots (free, no key). The listing then goes through the same automated
 * security checks and moderation as any submission: risky categories always wait for a
 * moderator, and nothing is published if a check fails.
 */
export { queueImports, urlHash, type QueueInput } from "./queue";

const IMAGE = /^image\/(png|jpe?g|webp|avif|gif)/;
const MAX_ATTEMPTS = 3;

async function fetchImage(url: string): Promise<Uint8Array | null> {
  const r = await safeFetch(url, { accept: IMAGE, maxBytes: 6 * 1024 * 1024 });
  if (!r.ok || !r.raw?.length || r.truncated || !IMAGE.test(r.headers["content-type"] ?? "")) return null;
  return new Uint8Array(r.raw);
}

/** A screenshot from WordPress.com mShots. The first request starts the capture; it answers with a GIF placeholder until it is ready. */
const mshotsUrl = (site: string) => `https://s.wordpress.com/mshots/v1/${encodeURIComponent(site)}?w=1280&h=800`;

/** Stores up to `max` images from the URLs, skipping repeated URLs and identical images. */
async function firstStored(urls: string[], kind: "LOGO" | "SCREENSHOT", adminId: string, max: number, seen = new Set<string>()): Promise<string[]> {
  const ids: string[] = [];
  for (const u of [...new Set(urls)]) {
    if (ids.length >= max) break;
    try {
      const bytes = await fetchImage(u);
      if (!bytes) continue;
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (seen.has(hash)) continue;
      seen.add(hash);
      ids.push((await storeImageBytes(bytes, kind, { adminId })).id);
    } catch { /* unsupported, too small, animated…: try the next one */ }
  }
  return ids;
}


/** The administrator new imports are credited to: the one who queued it, else the first active owner/administrator. */
async function importAdmin(preferred: string | null): Promise<string | null> {
  if (preferred && (await db.adminUser.findFirst({ where: { id: preferred, status: "ACTIVE" }, select: { id: true } }))) return preferred;
  const a = await db.adminUser.findFirst({ where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN"] } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return a?.id ?? null;
}

export type ImportOutcome = { status: "IMPORTED"; listingId: string } | { status: "SKIPPED" | "FAILED" | "RETRY" | "WAITING"; reason: string; stage?: string; category?: string };

/** Stage of the import pipeline where a candidate stopped, and a short error category. */
export type ImportStage = "fetch" | "duplicate" | "category" | "listing" | "admin";

/** Classifies a fetch failure so an administrator can tell a dead website from a temporary error. */
export function fetchCategory(status: number, message: string | undefined): { category: string; retryable: boolean } {
  if (/blocked|private|not allowed|forbidden address|resolve/i.test(message ?? "")) return { category: "blocked-address", retryable: false };
  if (/timeout|timed out/i.test(message ?? "")) return { category: "timeout", retryable: true };
  if (status === 404 || status === 410) return { category: "not-found", retryable: false };
  if (status === 401 || status === 403) return { category: "access-denied", retryable: true };
  if (status === 429 || status >= 500) return { category: "website-error", retryable: true };
  if (status >= 400) return { category: "http-error", retryable: false };
  return { category: "network", retryable: true };
}

export async function importCandidate(id: string): Promise<ImportOutcome> {
  const c = await db.importCandidate.findUnique({ where: { id } });
  if (!c || c.status === "IMPORTED") return { status: "SKIPPED", reason: "Already imported" };
  const adminId = await importAdmin(c.createdByAdminId);
  if (!adminId) return { status: "WAITING", reason: "No administrator account exists yet", stage: "admin", category: "no-admin" };
  const fail = async (status: "SKIPPED" | "FAILED" | "RETRY", reason: string, stage: ImportStage, category: string, retryable = status === "RETRY"): Promise<ImportOutcome> => {
    const attempts = c.attempts + 1;
    const final = status === "RETRY" ? (attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED") : status;
    await db.importCandidate.update({ where: { id }, data: { status: final, attempts, lastError: reason.slice(0, 500), failedStage: stage, errorCategory: category, retryable, processedAt: new Date() } });
    return { status: final === "QUEUED" ? "RETRY" : final, reason, stage, category };
  };
  // Claim the candidate atomically: a second click or an overlapping scheduler run gets nothing,
  // so the same website is never imported twice in parallel.
  const claimed = await db.importCandidate.updateMany({ where: { id, status: { in: ["QUEUED", "FAILED", "SKIPPED"] } }, data: { status: "IMPORTING", processedAt: new Date() } });
  if (claimed.count === 0) return { status: "SKIPPED", reason: "This import is already being processed" };

  const dup = await findDuplicate(c.domain, c.id);
  if (dup && (dup.kind === "listing" || dup.status !== "QUEUED")) return fail("SKIPPED", dup.kind === "listing" ? `Already listed as "${dup.name}" (${dup.status.toLowerCase()})` : `Already imported or importing as "${dup.name}"`, "duplicate", "duplicate", false);

  const cat = await db.category.findFirst({ where: { slug: c.categorySlug ?? "other", isEnabled: true, mergedIntoId: null }, include: { parent: true } })
    ?? await db.category.findFirst({ where: { slug: "other" }, include: { parent: true } });
  if (!cat) return fail("FAILED", `Category ${c.categorySlug} not found`, "category", "category-missing", false);

  const settings = await getSection("imports");
  const useMshots = settings.str("screenshots") !== "site";
  if (useMshots) void safeFetch(mshotsUrl(c.url), { accept: IMAGE }).catch(() => undefined); // start the capture early

  const page = await safeFetch(c.url);
  if (!page.ok || !page.body) {
    const fc = fetchCategory(page.status, page.error?.message);
    const reason = page.error?.message ? `Could not load the website: ${page.error.message}` : `The website answered HTTP ${page.status}`;
    return fc.retryable ? fail("RETRY", reason, "fetch", fc.category) : fail("FAILED", reason, "fetch", fc.category, false);
  }
  const base = page.finalUrl || c.url;
  const meta = parseSiteHtml(page.body, base);
  let manifest = null;
  if (meta.manifestUrl) {
    const m = await safeFetch(meta.manifestUrl, { accept: /json|manifest/ });
    if (m.ok && m.raw?.length) manifest = parseManifest(m.raw.toString("utf8"), meta.manifestUrl);
  }

  const origin = new URL(base).origin;
  const logoIds = await firstStored([...(manifest?.iconUrls ?? []), ...meta.iconUrls, `${origin}/apple-touch-icon.png`], "LOGO", adminId, 1);
  const shotHashes = new Set<string>();
  const shotIds = await firstStored([...(manifest?.screenshotUrls ?? []).slice(0, 3), ...meta.imageUrls.slice(0, 1)], "SCREENSHOT", adminId, 3, shotHashes);
  if (useMshots && shotIds.length < 4) shotIds.push(...(await firstStored([mshotsUrl(c.url)], "SCREENSHOT", adminId, 1, shotHashes)));

  const name = (c.name || manifest?.name || meta.name || c.domain).slice(0, 80);
  let description = [meta.description, manifest?.description].filter(Boolean).sort((a, b) => b!.length - a!.length)[0]?.trim() ?? "";
  const tagline = description ? description.split(/(?<=[.!?])\s/)[0]!.slice(0, 140) : undefined;
  if (description.length < 30) description = `${description ? `${description} ` : ""}${name} is a web app in ${cat.name}. Visit the website for details.`.trim();
  const ownPolicy = (u: string | null) => (u && normalizeWebsiteUrl(u) ? u : undefined);

  const input: Record<string, unknown> = {
    name, tagline, description: description.slice(0, 5000), features: [], websiteUrl: c.url,
    privacyPolicyUrl: ownPolicy(meta.privacyUrl), termsUrl: ownPolicy(meta.termsUrl),
    publisherName: (meta.siteName || name).slice(0, 120), primaryCategoryId: cat.id, categoryIds: [], tags: [],
    // Pricing is never guessed: "not stated" until a moderator or the developer sets it.
    pricingModel: "UNKNOWN",
    isOpenSource: false, platforms: ["WEB"], isBrowserBased: true, isMobileFriendly: meta.mobileFriendly, isPwaInstallable: Boolean(manifest?.standalone),
    ageRating: cat.defaultAgeRating, supportedCountries: [], languages: meta.lang ? [meta.lang.slice(0, 2)] : [],
    logoAssetId: logoIds[0], screenshotAssetIds: shotIds,
  };
  try {
    const listing = await createEditorialListing(adminId, input, {
      source: `Automatic import of ${c.url}${c.source === "catalogue" ? " (Webcenta catalogue)" : ""}`,
      evidence: "Name, description, logo and images taken from the website's own metadata and web app manifest." + (useMshots ? " Screenshot captured with WordPress.com mShots." : "") + (c.note ? ` Note: ${c.note}` : ""),
    });
    await db.importCandidate.update({ where: { id }, data: { status: "IMPORTED", listingId: listing.id, attempts: c.attempts + 1, lastError: null, failedStage: null, errorCategory: null, retryable: false, processedAt: new Date() } });
    return { status: "IMPORTED", listingId: listing.id };
  } catch (e) {
    return fail("FAILED", `The listing could not be created: ${e instanceof Error ? e.message : String(e)}`, "listing", "invalid-details", false);
  }
}

const LAST_RUN = "imports.lastRunAt";

/** Cron: imports the next few queued web apps, at most once per configured interval. */
export async function runImports(now = new Date()): Promise<number> {
  const s = await getSection("imports");
  if (!s.enabled) return 0;
  const every = Math.max(5, s.num("intervalMinutes") || 30);
  const last = await db.systemSetting.findUnique({ where: { key: LAST_RUN } });
  const lastAt = Date.parse(String((last?.value as { at?: string } | null)?.at ?? ""));
  if (lastAt && now.getTime() - lastAt < every * 60_000 - 30_000) return 0;
  await db.systemSetting.upsert({ where: { key: LAST_RUN }, create: { key: LAST_RUN, value: { at: now.toISOString() } }, update: { value: { at: now.toISOString() } } });
  // Recover candidates left IMPORTING by an interrupted run.
  const stale = new Date(now.getTime() - 30 * 60_000);
  await db.importCandidate.updateMany({ where: { status: "IMPORTING", OR: [{ processedAt: null, createdAt: { lt: stale } }, { processedAt: { lt: stale } }] }, data: { status: "QUEUED" } });
  const next = await db.importCandidate.findMany({ where: { status: "QUEUED", ...(s.bool("catalogueSource") ? {} : { source: { not: "catalogue" } }) }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: Math.min(20, Math.max(1, s.num("perRun") || 4)), select: { id: true } });
  let imported = 0;
  for (const n of next) {
    const r = await importCandidate(n.id).catch((e) => ({ status: "FAILED", reason: String(e) }) as ImportOutcome);
    if (r.status === "WAITING") { await db.importCandidate.update({ where: { id: n.id }, data: { status: "QUEUED" } }); break; }
    if (r.status === "IMPORTED") imported++;
  }
  return imported;
}
