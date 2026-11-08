/**
 * Base data every installation needs (idempotent; never overwrites admin changes):
 * the category taxonomy, homepage sections, monitoring policies, developer plans
 * and DRAFT legal templates. Used by `npm run db:seed` and by first-time setup.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { CATEGORY_EMOJI, flattenTaxonomy } from "@/server/catalog/taxonomy";

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
  // Legal policy templates are created as UNPUBLISHED drafts for review by a lawyer.
  const drafts: Array<[string, string, string]> = [
    ["TERMS_OF_SERVICE", "Terms of Service", "DRAFT — requires legal review before publication.\n\n## Using Webcenta\nWebcenta lists third-party websites. We do not operate them.\n\n## Accounts\nKeep your credentials secure. We may suspend accounts that break these terms."],
    ["PRIVACY_POLICY", "Privacy Policy", "DRAFT — requires legal review before publication.\n\n## What we collect\n- Account details you provide\n- Anonymous, daily-rotating visit counters (no IP addresses stored in analytics)\n- Browsing history only if you are signed in and keep it enabled\n\n## Your rights\nYou can export or delete your data from Account → Privacy & data."],
    ["CONTENT_POLICY", "Content Policy", "DRAFT — requires legal review before publication.\n\nProhibited: phishing, malware, fraud, impersonation, illegal marketplaces and content that exploits minors."],
    ["DEVELOPER_AGREEMENT", "Developer Agreement", "DRAFT — requires legal review before publication.\n\nSubmissions are reviewed and monitored. Payment never bypasses moderation."],
    ["REVIEW_GUIDELINES", "Review Guidelines", "DRAFT — requires legal review before publication.\n\nWrite honest reviews based on your own experience. Do not review apps you develop."],
  ];
  for (const [type, title, body] of drafts) {
    if (!(await db.legalPolicy.findFirst({ where: { type: type as never } }))) {
      await db.legalPolicy.create({ data: { type: type as never, version: 1, title, body, effectiveAt: new Date() } });
    }
  }
  log("platform defaults: plans + draft legal templates");
}

export async function seedBase(db: PrismaClient, log: (m: string) => void = console.log) {
  await seedTaxonomy(db, log);
  await seedHomepageSections(db, log);
  await seedMonitoringPolicy(db, log);
  await seedPlatformDefaults(db, log);
}
