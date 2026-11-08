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
import { RISK_ORDER, seedBase } from "../src/server/setup/base-seed";
import { FIXTURE_COLLECTIONS, FIXTURE_FEATURED, FIXTURE_LISTINGS, FIXTURE_RELATIONS } from "../prisma/seed/dev-fixtures";

const { pool } = buildPoolConfig({
  DATABASE_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  DATABASE_SSL: process.env.DATABASE_SSL as never,
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
  NODE_ENV: process.env.NODE_ENV,
});
const db = extendClient(new PrismaClient({ adapter: new PrismaMariaDb({ ...pool, connectionLimit: 2 }) }));

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
  await seedBase(db);
  if (process.argv.includes("--fixtures")) await seedFixtures();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
