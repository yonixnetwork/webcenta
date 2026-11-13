import { parse, type HTMLElement } from "node-html-parser";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { safeFetch } from "@/server/scanner/safe-fetch";
import { listingInputSchema } from "@/server/listings/input";
import { parseManifest, parseSiteHtml } from "./metadata";

/**
 * Description enrichment for imported listings (scheduled job "imports.enrich").
 *
 * Many imports only had the website's one-line meta description. This job reads the app's own
 * homepage again and builds a fuller description from what the website itself says: its
 * description, the explanatory paragraphs of the page and its feature list. Nothing is invented
 * (no features, pricing or compatibility the site does not state) and no other source is used.
 *
 * Safety:
 * - Only editorial imports without a developer: a developer's or a moderator's own text is never
 *   touched (developers confirm their listings through the developer portal).
 * - Never published directly. A published listing gets a new revision "under review" (Admin →
 *   Submissions) that a moderator approves or rejects; the approved text stays in the revision
 *   history (rollback = approve the previous revision's text again). An import still waiting for
 *   review has its pending revision updated, with the original text kept in the reviewer notes.
 * - Only when the result is clearly better: at least 250 characters and 1.5× the current text.
 */
const MIN_CURRENT = 300; // listings with a description shorter than this are candidates
const MIN_NEW = 250;
const MAX_NEW = 1800;
const RECHECK_DAYS = 30;

const NOISE = /cookie|consent|javascript|sign (in|up)|log ?in|subscribe|newsletter|copyright|all rights reserved|privacy policy|terms of (use|service)|captcha|enable js|your browser|©/i;

const clean = (t: string) => t.replace(/\s+/g, " ").replace(/\s([,.;:!?])/g, "$1").trim();
const sentenceCase = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`);

/** Overlap test: true when most words of `a` already appear in `b`. */
function mostlyContained(a: string, b: string): boolean {
  const words = a.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  if (!words.length) return true;
  const hay = b.toLowerCase();
  return words.filter((w) => hay.includes(w)).length / words.length > 0.7;
}

/** Text the website uses to explain itself: paragraphs and feature-list items from its main content. */
export function extractSiteText(html: string): { paragraphs: string[]; features: string[] } {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  for (const el of root.querySelectorAll("script, style, noscript, nav, footer, header, form, [aria-hidden=true], [hidden], dialog")) el.remove();
  const scope: HTMLElement = root.querySelector("main") ?? root.querySelector("[role=main]") ?? root.querySelector("article") ?? root.querySelector("body") ?? root;
  const paragraphs: string[] = [];
  for (const p of scope.querySelectorAll("p")) {
    const t = clean(p.text);
    if (t.length < 60 || t.length > 500 || NOISE.test(t) || /https?:\/\//.test(t)) continue;
    if (!/[a-z]{3,}\s+[a-z]{3,}/i.test(t)) continue;
    if (paragraphs.some((x) => mostlyContained(t, x))) continue;
    paragraphs.push(t);
    if (paragraphs.length >= 4) break;
  }
  const features: string[] = [];
  for (const li of scope.querySelectorAll("li")) {
    if (li.querySelector("a") && clean(li.text) === clean(li.querySelector("a")!.text)) continue; // navigation-like lists
    const t = clean(li.text);
    if (t.length < 12 || t.length > 140 || NOISE.test(t) || !/\s/.test(t)) continue;
    if (features.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    features.push(t.replace(/[.;]$/, ""));
    if (features.length >= 6) break;
  }
  return { paragraphs, features };
}

/** Builds the fuller description, or null when the website does not say enough. */
export function composeDescription(name: string, current: string, meta: { description: string | null; manifestDescription: string | null }, site: { paragraphs: string[]; features: string[] }): string | null {
  const parts: string[] = [];
  const lead = [meta.description, meta.manifestDescription].filter((x): x is string => Boolean(x && x.trim().length >= 30)).map(clean).sort((a, b) => b.length - a.length)[0];
  if (lead) parts.push(sentenceCase(lead));
  for (const p of site.paragraphs) if (!parts.some((x) => mostlyContained(p, x))) parts.push(sentenceCase(p));
  let text = parts.join("\n\n");
  if (site.features.length >= 3) text += `${text ? "\n\n" : ""}What ${name}'s website highlights:\n${site.features.map((f) => `• ${f}`).join("\n")}`;
  text = text.trim().slice(0, MAX_NEW);
  if (text.length < MIN_NEW || text.length < current.trim().length * 1.5) return null;
  return text;
}

type Outcome = "proposed" | "no-better-text" | "fetch-failed" | "skipped-developer" | "skipped-pending";

async function enrichOne(listingId: string): Promise<Outcome> {
  const l = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: { id: true, name: true, description: true, websiteUrl: true, status: true, developerId: true,
      revisions: { orderBy: { revisionNumber: "desc" }, take: 5, select: { id: true, status: true, data: true, revisionNumber: true, submitterNotes: true } } },
  });
  if (l.developerId) return "skipped-developer";
  const page = await safeFetch(l.websiteUrl);
  if (!page.ok || !page.body) return "fetch-failed";
  const base = page.finalUrl || l.websiteUrl;
  const meta = parseSiteHtml(page.body, base);
  let manifestDescription: string | null = null;
  if (meta.manifestUrl) {
    const m = await safeFetch(meta.manifestUrl, { accept: /json|manifest/ });
    if (m.ok && m.raw?.length) manifestDescription = parseManifest(m.raw.toString("utf8"), meta.manifestUrl)?.description ?? null;
  }
  const pending = l.revisions.find((r) => ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(r.status));
  const current = pending ? String((pending.data as { description?: string }).description ?? l.description) : l.description;
  const next = composeDescription(l.name, current, { description: meta.description, manifestDescription }, extractSiteText(page.body));
  if (!next) return "no-better-text";
  const note = `Description enrichment ${new Date().toISOString().slice(0, 10)} from ${base} (the website's own text). Previous description (${current.trim().length} characters): ${current.trim().slice(0, 600)}`;

  if (pending) {
    // An import that is still waiting for review: improve the text the moderator will review.
    if (pending.status === "AUTOMATED_CHECKS") return "skipped-pending";
    const data = listingInputSchema.parse({ ...(pending.data as object), description: next });
    await db.listingRevision.update({ where: { id: pending.id }, data: { data: data as Prisma.InputJsonValue, submitterNotes: [pending.submitterNotes, note].filter(Boolean).join("\n\n").slice(0, 8000) } });
  } else {
    if (l.status !== "PUBLISHED") return "skipped-pending";
    const approved = l.revisions.find((r) => r.status === "APPROVED");
    if (!approved) return "no-better-text";
    const data = listingInputSchema.parse({ ...(approved.data as object), description: next });
    await db.listingRevision.create({ data: { listingId: l.id, revisionNumber: (l.revisions[0]?.revisionNumber ?? 0) + 1, status: "UNDER_REVIEW", submittedAt: new Date(), data: data as Prisma.InputJsonValue, submitterNotes: note } });
  }
  await audit({ actorType: "SYSTEM", action: "listing.description.enrich", targetType: "Listing", targetId: l.id, metadata: { from: current.trim().length, to: next.length, source: base, review: true } });
  return "proposed";
}

/** Scheduled job: looks at a few imported listings with short descriptions per run. */
export async function enrichDescriptions(limit = 4, now = new Date()): Promise<Record<string, number>> {
  const recheckBefore = new Date(now.getTime() - RECHECK_DAYS * 86_400_000);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT l.id FROM Listing l
    WHERE l.source = 'EDITORIAL' AND l.developerId IS NULL AND l.deletedAt IS NULL
      AND l.status IN ('PUBLISHED', 'UNDER_REVIEW')
      AND l.editorialSource LIKE 'Automatic import of %'
      AND CHAR_LENGTH(l.description) < ${MIN_CURRENT}
      AND (l.enrichedAt IS NULL OR l.enrichedAt < ${recheckBefore})
      AND NOT EXISTS (SELECT 1 FROM ListingRevision r WHERE r.listingId = l.id AND r.status = 'UNDER_REVIEW' AND l.status = 'PUBLISHED')
    ORDER BY l.enrichedAt IS NOT NULL, l.enrichedAt, l.createdAt
    LIMIT ${limit}`;
  const counts: Record<string, number> = {};
  for (const { id } of rows) {
    let outcome: Outcome | "error";
    try { outcome = await enrichOne(id); } catch { outcome = "error"; }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    await db.listing.update({ where: { id }, data: { enrichedAt: now, enrichmentResult: outcome } });
  }
  return { looked: rows.length, ...counts };
}
