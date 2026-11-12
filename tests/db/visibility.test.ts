import { getCategoryTree, treeForAge } from "@/server/catalog/categories";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { publicListingWhere, publicCategoryWhere } from "@/server/catalog/visibility";
import { getPublicListing } from "@/server/catalog/listings";
import { anon, HIDDEN } from "./helpers";

describe("public visibility filter", () => {
  it("never exposes unpublished, security-restricted or restricted-category listings", async () => {
    const visible = await db.listing.findMany({ where: publicListingWhere(anon()), select: { slug: true } });
    const slugs = visible.map((v) => v.slug);
    for (const h of HIDDEN) expect(slugs).not.toContain(h);
    expect(slugs).toContain("sample-lumen-notes");
    for (const h of HIDDEN) expect(await getPublicListing(anon(), h)).toBeNull();
  });
  it("applies country restrictions (and the unknown-country policy)", async () => {
    expect(await getPublicListing(anon({ country: "DE" }), "sample-geo-limited")).toBeNull();
    expect(await getPublicListing(anon({ country: "US" }), "sample-geo-limited")).not.toBeNull();
    expect(await getPublicListing(anon({ country: null, unknownCountryPolicy: "deny" }), "sample-geo-limited")).toBeNull();
    expect(await getPublicListing(anon({ country: null, unknownCountryPolicy: "allow" }), "sample-geo-limited")).not.toBeNull();
  });
  it("applies category-level country restrictions", async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "weather-forecasts" } });
    const r = await db.geoRestriction.create({ data: { categoryId: cat.id, countryCode: "FR", reason: "test" } });
    try {
      expect(await getPublicListing(anon({ country: "FR" }), "sample-skyline-weather")).toBeNull();
      expect(await getPublicListing(anon({ country: "US" }), "sample-skyline-weather")).not.toBeNull();
    } finally {
      await db.geoRestriction.delete({ where: { id: r.id } });
    }
  });
  it("hides 18+ listings from anonymous viewers", async () => {
    const l = await db.listing.update({ where: { slug: "sample-tile-tactics" }, data: { ageRating: "AGE_18_PLUS" } });
    try {
      expect(await getPublicListing(anon(), l.slug)).toBeNull();
      expect(await getPublicListing(anon({ maxAgeRating: "AGE_18_PLUS" }), l.slug)).not.toBeNull();
    } finally {
      await db.listing.update({ where: { id: l.id }, data: { ageRating: "ALL_AGES" } });
    }
  });
  it("hides listings when a parent category is disabled", async () => {
    const parent = await db.category.update({ where: { slug: "weather" }, data: { isEnabled: false } });
    try {
      expect(await getPublicListing(anon(), "sample-skyline-weather")).toBeNull();
      const cats = await db.category.findMany({ where: publicCategoryWhere(), select: { slug: true } });
      expect(cats.map((c) => c.slug)).not.toContain("weather-forecasts");
    } finally {
      await db.category.update({ where: { id: parent.id }, data: { isEnabled: true } });
    }
  });
  it("does not list restricted categories publicly", async () => {
    const cats = (await db.category.findMany({ where: publicCategoryWhere(), select: { slug: true } })).map((c) => c.slug);
    for (const s of ["betting-gambling", "betting-gambling-casinos", "cryptocurrency-token-launchpads"]) expect(cats).not.toContain(s);
    expect(cats).toContain("cryptocurrency-portfolio-tracking");
  });
  it("hides adults-only categories from visitors and minors, and shows them to adults", async () => {
    const tree = await getCategoryTree();
    const slugs = (t: typeof tree) => t.flatMap((n) => [n.slug, ...n.children.map((c) => c.slug)]);
    for (const s of ["adult-entertainment", "forex", "cryptocurrency-exchanges", "dating"]) {
      expect(slugs(treeForAge(tree, "AGE_16_PLUS")), s).not.toContain(s);
      expect(slugs(treeForAge(tree, "AGE_18_PLUS")), s).toContain(s);
    }
    expect(slugs(treeForAge(tree, "AGE_13_PLUS"))).toContain("education");
  });
});
