/**
 * Seeds platform configuration, and optionally DEV fixtures.
 *
 *   npm run db:seed                       taxonomy, homepage sections, monitoring policy (safe in production)
 *   ALLOW_DEV_FIXTURES=true npm run db:seed -- --fixtures   + fictional sample listings (never production)
 *
 * Idempotent: existing categories/sections/policies are not overwritten, so
 * administrator changes survive re-seeding.
 */
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildPoolConfig } from "../src/server/db-config";
import { extendClient } from "../src/server/db";
import { CATEGORY_EMOJI, flattenTaxonomy } from "../src/server/catalog/taxonomy";
import { FIXTURE_COLLECTIONS, FIXTURE_FEATURED, FIXTURE_LISTINGS, FIXTURE_RELATIONS } from "../prisma/seed/dev-fixtures";

const { pool } = buildPoolConfig({
  DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  DATABASE_SSL: process.env.DATABASE_SSL as never,
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
  NODE_ENV: process.env.NODE_ENV,
});
const db = extendClient(new PrismaClient({ adapter: new PrismaMariaDb({ ...pool, connectionLimit: 2 }) }));

const RISK_ORDER = ["LOW", "MEDIUM", "HIGH", "PROHIBITED"] as const;

async function seedTaxonomy() {
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
  console.log(`taxonomy: ${flat.length} categories (${created} created)`);
}

async function seedHomepageSections() {
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
  console.log(`homepage sections: ${sections.length}`);
}

async function seedMonitoringPolicy() {
  const policies = [
    { riskTier: "LOW", scanIntervalHours: 168, allowAutoApproval: true },
    { riskTier: "MEDIUM", scanIntervalHours: 72, allowAutoApproval: false },
    { riskTier: "HIGH", scanIntervalHours: 24, allowAutoApproval: false },
    { riskTier: "PROHIBITED", scanIntervalHours: 24, allowAutoApproval: false },
  ] as const;
  for (const p of policies) await db.monitoringPolicy.upsert({ where: { riskTier: p.riskTier }, create: p, update: {} });
  console.log("monitoring policies: 4");
}

async function seedPlatformDefaults() {
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
  console.log("platform defaults: plans + draft legal templates");
}

async function seedFixtures() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_FIXTURES !== "true") {
    throw new Error("Refusing to load dev fixtures: requires ALLOW_DEV_FIXTURES=true and NODE_ENV != production.");
  }
  const day = 86_400_000;
  const now = Date.now();
  const cat = async (slug: string) => (await db.category.findUniqueOrThrow({ where: { slug } })).id;

  for (const f of FIXTURE_LISTINGS) {
    const primaryId = await cat(f.primary);
    const catIds = [primaryId, ...(await Promise.all((f.extraCategories ?? []).map(cat)))];
    const publishedAt = new Date(now - f.publishedDaysAgo * day);
    const contentUpdatedAt = f.updatedDaysAfterPublish ? new Date(publishedAt.getTime() + f.updatedDaysAfterPublish * day) : publishedAt;
    const categoryRisk = (await db.category.findMany({ where: { id: { in: catIds } }, select: { riskTier: true } }))
      .map((c) => c.riskTier).sort((a, b) => RISK_ORDER.indexOf(b) - RISK_ORDER.indexOf(a))[0] ?? "LOW";
    const data = {
      name: f.name, tagline: f.tagline, description: f.description, features: f.features,
      websiteUrl: `https://${f.slug.replace(/^sample-/, "")}.example/`, domain: `${f.slug.replace(/^sample-/, "")}.example`,
      source: "EDITORIAL" as const, publisherName: `${f.name} Team (fictional)`,
      editorialSource: "DEV FIXTURE — fictional", primaryCategoryId: primaryId,
      pricingModel: f.pricing, isOpenSource: Boolean(f.openSource), platforms: f.platforms ?? ["WEB"],
      isMobileFriendly: Boolean(f.mobileFriendly), isPwaInstallable: Boolean(f.pwa), ageRating: f.age ?? "ALL_AGES",
      riskTier: categoryRisk, isEditorsPick: Boolean(f.editorsPick), status: f.status ?? "PUBLISHED",
      securityStatus: f.securityStatus ?? "NOT_SCANNED", supportedCountries: f.supportedCountries ?? [], languages: ["en"],
      publishedAt: (f.status ?? "PUBLISHED") === "PUBLISHED" ? publishedAt : null, contentUpdatedAt,
    };
    const listing = await db.listing.upsert({ where: { slug: f.slug }, create: { slug: f.slug, ...data }, update: data });
    await db.listingCategory.deleteMany({ where: { listingId: listing.id } });
    await db.listingCategory.createMany({ data: catIds.map((categoryId, i) => ({ listingId: listing.id, categoryId, isPrimary: i === 0 })) });
    await db.listingTag.deleteMany({ where: { listingId: listing.id } });
    for (const t of f.tags) {
      const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const tag = await db.tag.upsert({ where: { slug }, create: { slug, name: t }, update: {} });
      await db.listingTag.create({ data: { listingId: listing.id, tagId: tag.id } });
    }
    await db.geoRestriction.deleteMany({ where: { listingId: listing.id } });
    for (const cc of f.geoBlocked ?? []) {
      await db.geoRestriction.create({ data: { listingId: listing.id, countryCode: cc, reason: "DEV FIXTURE" } });
    }
  }
  const id = async (slug: string) => (await db.listing.findUniqueOrThrow({ where: { slug } })).id;
  for (const [from, to, type] of FIXTURE_RELATIONS) {
    const [a, b] = [await id(from), await id(to)];
    await db.listingRelation.upsert({
      where: { fromListingId_toListingId_type: { fromListingId: a, toListingId: b, type } },
      create: { fromListingId: a, toListingId: b, type, source: "EDITORIAL" }, update: {},
    });
  }
  for (const c of FIXTURE_COLLECTIONS) {
    const col = await db.collection.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, title: c.title, description: c.description, isEditorial: true, visibility: "PUBLIC" },
      update: { title: c.title, description: c.description },
    });
    await db.collectionItem.deleteMany({ where: { collectionId: col.id } });
    for (const [i, s] of c.items.entries()) await db.collectionItem.create({ data: { collectionId: col.id, listingId: await id(s), sortOrder: i } });
  }
  await db.featuredPlacement.deleteMany({ where: { listing: { slug: { startsWith: "sample-" } } } });
  for (const [i, s] of FIXTURE_FEATURED.entries()) {
    await db.featuredPlacement.create({ data: { listingId: await id(s), slot: "HOME_FEATURED", sortOrder: i, startsAt: new Date(now - day) } });
  }
  console.log(`dev fixtures: ${FIXTURE_LISTINGS.length} fictional listings`);
}

async function main() {
  await seedTaxonomy();
  await seedHomepageSections();
  await seedMonitoringPolicy();
  await seedPlatformDefaults();
  if (process.argv.includes("--fixtures")) await seedFixtures();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
