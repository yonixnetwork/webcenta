import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { normalizeWebsiteUrl } from "@/lib/url";

export const urlHash = (url: string) => createHash("sha256").update(url).digest("hex");

export interface QueueInput { url: string; categorySlug?: string | null; name?: string | null; note?: string | null; source?: string; priority?: number; adminId?: string | null }

/** Adds URLs to the import queue (duplicates and invalid URLs are ignored). Returns how many were added. */
export async function queueImports(items: QueueInput[]): Promise<number> {
  const rows = items.flatMap((i) => {
    const u = normalizeWebsiteUrl(i.url.trim());
    if (!u) return [];
    const url = u.toString();
    return [{ urlHash: urlHash(url), url, domain: u.hostname, categorySlug: i.categorySlug ?? null, name: i.name ?? null, note: i.note ?? null, source: i.source ?? "admin", priority: i.priority ?? 0, createdByAdminId: i.adminId ?? null }];
  });
  if (!rows.length) return 0;
  const r = await db.importCandidate.createMany({ data: rows, skipDuplicates: true });
  return r.count;
}

