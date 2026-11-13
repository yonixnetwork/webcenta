/**
 * Base data every installation needs (idempotent; never overwrites admin changes):
 * the category taxonomy, homepage sections, monitoring policies, developer plans
 * and DRAFT legal templates. Used by `npm run db:seed` and by first-time setup.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { CATEGORY_EMOJI, TOP_LEVEL_ORDER, flattenTaxonomy } from "@/server/catalog/taxonomy";
import { LEGAL_TEXTS } from "./legal-texts";
import { catalogueEntries } from "@/server/importer/catalogue";
import { queueImports } from "@/server/importer/queue";

/**
 * Version of the base data. Raise it when the base data changes (for example new
 * categories); every installation then re-runs the idempotent seed once at startup.
 */
export const BASE_SEED_VERSION = 2;
const SEED_KEY = "seed.base.version";

export async function baseSeedVersion(db: PrismaClient): Promise<number> {
  const row = await db.systemSetting.findUnique({ where: { key: SEED_KEY }, select: { value: true } });
  return Number((row?.value as { v?: number } | null)?.v ?? 0);
}

/**
 * One-time changes to categories created by an earlier version of the base data. Each
 * change applies only while the row still has the value the earlier version created,
 * so an administrator's own edits are never overwritten.
 */
async function reviseTaxonomy(db: PrismaClient, from: number, log: (m: string) => void) {
  if (from >= 2) return;
  let changed = 0;
  // Store-style order of the top-level categories.
  for (const [i, slug] of TOP_LEVEL_ORDER.entries()) {
    changed += (await db.category.updateMany({ where: { slug, parentId: null }, data: { sortOrder: i } })).count;
  }
  const renames: Array<[slug: string, from: string, to: string]> = [
    ["photography", "Photography", "Photo & Video"],
    ["art-design", "Art & Design", "Graphics & Design"],
    ["children-family", "Children & Family", "Kids & Family"],
    ["adult-entertainment", "Adult Entertainment", "Adult Content"],
  ];
  for (const [slug, old, name] of renames) changed += (await db.category.updateMany({ where: { slug, name: old }, data: { name } })).count;
  await db.category.updateMany({ where: { slug: "adult-entertainment", description: { not: null } }, data: { description: "Legal adult services. Shown only to signed-in users who confirmed they are adults." } });
  // Shown to adults (18+) instead of hidden: crypto exchanges and DeFi, forex, adult content.
  // Every listing in them still needs a moderator, and licences where they apply.
  const adultVisible = ["cryptocurrency-exchanges", "cryptocurrency-defi", "cryptocurrency-trading-bots", "forex", "adult-entertainment"];
  const forexChildren = (await db.category.findMany({ where: { parent: { slug: "forex" } }, select: { slug: true } })).map((c) => c.slug);
  changed += (await db.category.updateMany({ where: { slug: { in: [...adultVisible, ...forexChildren] }, isRestricted: true }, data: { isRestricted: false, defaultAgeRating: "AGE_18_PLUS" } })).count;
  log(`taxonomy revision 2: ${changed} change(s)`);
}

export const RISK_ORDER = ["LOW", "MEDIUM", "HIGH", "PROHIBITED"] as const;

export async function seedTaxonomy(db: PrismaClient, log: (m: string) => void = console.log) {
  const flat = flattenTaxonomy();
  const ids = new Map<string, string>();
  let created = 0;
  for (const n of flat) {
    const parentId = n.parentSlug ? ids.get(n.parentSlug) : null;
    const parent = n.parentSlug ? flat.find((p) => p.slug === n.parentSlug) : undefined;
    // Children inherit the stricter of their own and their parent's settings.
    const risk = [n.riskTier ?? "LOW", parent?.riskTier ?? "LOW"].sort((a, b) => RISK_ORDER.indexOf(b) - RISK_ORDER.indexOf(a))[0]!;
    const emoji = n.parentSlug ? null : (CATEGORY_EMOJI[n.slug] ?? null);
    const existing = await db.category.findUnique({ where: { slug: n.slug }, select: { id: true, emoji: true } });
    if (existing) {
      ids.set(n.slug, existing.id);
      // Fill in an emoji only where none is set; never overwrite an administrator's choice.
      if (emoji && existing.emoji === null) await db.category.update({ where: { id: existing.id }, data: { emoji } });
      continue;
    }
    const row = await db.category.create({
      data: {
        slug: n.slug, name: n.name, icon: n.icon, emoji, description: n.description ?? null, parentId, sortOrder: n.sortOrder,
        riskTier: risk, defaultAgeRating: n.ageRating ?? parent?.ageRating ?? "ALL_AGES",
        isRestricted: Boolean(n.restricted || parent?.restricted),
        requiresManualReview: Boolean(n.manualReview || parent?.manualReview || risk === "HIGH"),
        requiresComplianceDocs: Boolean(n.complianceDocs || parent?.complianceDocs),
      },
    });
    ids.set(n.slug, row.id);
    created++;
  }
  log(`taxonomy: ${flat.length} categories (${created} created)`);
}

export async function seedHomepageSections(db: PrismaClient, log: (m: string) => void = console.log) {
  const sections = [
    { key: "featured", title: "Featured", type: "FEATURED" },
    { key: "editors-picks", title: "Editor's picks", type: "EDITORS_PICKS" },
    { key: "trending", title: "Trending now", type: "TRENDING" },
    { key: "popular", title: "Most popular", type: "POPULAR" },
    { key: "top-rated", title: "Highly rated", type: "TOP_RATED" },
    { key: "new", title: "New on Webcenta", type: "NEW" },
    { key: "recently-updated", title: "Recently updated", type: "RECENTLY_UPDATED" },
    { key: "by-category", title: "By category", type: "BY_CATEGORY",
      config: { categorySlugs: ["ai", "productivity", "developer-tools", "education", "games"] } },
    { key: "collections", title: "Curated collections", type: "COLLECTION" },
  ] as const;
  for (const [i, s] of sections.entries()) {
    await db.homepageSection.upsert({
      where: { key: s.key },
      create: { key: s.key, title: s.title, type: s.type, sortOrder: i, config: "config" in s ? s.config : undefined },
      update: {},
    });
  }
  log(`homepage sections: ${sections.length}`);
}

export async function seedMonitoringPolicy(db: PrismaClient, log: (m: string) => void = console.log) {
  const policies = [
    { riskTier: "LOW", scanIntervalHours: 168, allowAutoApproval: true },
    { riskTier: "MEDIUM", scanIntervalHours: 72, allowAutoApproval: false },
    { riskTier: "HIGH", scanIntervalHours: 24, allowAutoApproval: false },
    { riskTier: "PROHIBITED", scanIntervalHours: 24, allowAutoApproval: false },
  ] as const;
  for (const p of policies) await db.monitoringPolicy.upsert({ where: { riskTier: p.riskTier }, create: p, update: {} });
  log("monitoring policies: 4");
}

export async function seedPlatformDefaults(db: PrismaClient, log: (m: string) => void = console.log) {
  // Developer plans: Free is the only active plan. Paid plans have NO price and are inactive
  // until the owner approves pricing and a payment provider is integrated.
  await db.developerPlan.upsert({ where: { code: "free" }, create: { code: "free", name: "Free", entitlements: { listings: 10, analyticsHistoryDays: 90 }, isActive: true, priceCents: 0, currency: "USD" }, update: {} });
  await db.developerPlan.upsert({ where: { code: "pro" }, create: { code: "pro", name: "Pro (planned)", entitlements: { listings: 100, analyticsHistoryDays: 365, sponsoredRequests: true }, isActive: false }, update: {} });
  // Published starting versions of every policy (footer links must always work). An existing
  // install's untouched seed drafts ("DRAFT — requires legal review…", never published) are
  // replaced by these; anything an administrator wrote or published is left alone.
  const now = new Date();
  for (const [type, t] of Object.entries(LEGAL_TEXTS)) {
    const versions = await db.legalPolicy.findMany({ where: { type: type as never }, orderBy: { version: "desc" } });
    if (!versions.length) {
      await db.legalPolicy.create({ data: { type: type as never, version: 1, title: t.title, body: t.body, effectiveAt: now, publishedAt: now } });
    } else if (versions.every((v) => !v.publishedAt && v.body.startsWith("DRAFT — requires legal review"))) {
      await db.legalPolicy.update({ where: { id: versions[0]!.id }, data: { title: t.title, body: t.body, effectiveAt: now, publishedAt: now } });
    }
  }
  log("platform defaults: plans + published policies");
}

export async function seedBase(db: PrismaClient, log: (m: string) => void = console.log) {
  const from = await baseSeedVersion(db).catch(() => 0);
  const fresh = (await db.category.count()) === 0;
  await seedTaxonomy(db, log);
  if (!fresh) await reviseTaxonomy(db, from, log);
  await seedHomepageSections(db, log);
  await seedMonitoringPolicy(db, log);
  await seedPlatformDefaults(db, log);
  if (from < 2) {
    // The researched starter catalogue joins the import queue once (imported gradually by the scheduled job).
    const added = await queueImports(db, catalogueEntries().map((e) => ({ ...e, source: "catalogue" })));
    log(`import queue: ${added} web app(s) from the Webcenta catalogue`);
  }
  await db.systemSetting.upsert({ where: { key: SEED_KEY }, create: { key: SEED_KEY, value: { v: BASE_SEED_VERSION } }, update: { value: { v: BASE_SEED_VERSION } } });
}
