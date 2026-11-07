import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/search-params";
import { searchListings, suggest } from "@/server/search/search";
import { getRelated } from "@/server/catalog/alternatives";
import { getHomepage } from "@/server/catalog/homepage";
import { db } from "@/server/db";
import { anon, HIDDEN } from "./helpers";

const slugs = (r: { items: Array<{ slug: string }> }) => r.items.map((i) => i.slug);

describe("search", () => {
  it("finds by name, feature and tag", async () => {
    expect(slugs(await searchListings(anon(), parseFilters({ q: "notes" })))).toEqual(expect.arrayContaining(["sample-lumen-notes", "sample-quillpad"]));
    expect(slugs(await searchListings(anon(), parseFilters({ q: "backlinks" })))[0]).toBe("sample-lumen-notes");
    expect(slugs(await searchListings(anon(), parseFilters({ q: "kanban" })))).toContain("sample-taskforge");
  });
  it("supports prefixes and typos", async () => {
    expect(slugs(await searchListings(anon(), parseFilters({ q: "lume" })))).toContain("sample-lumen-notes");
    expect(slugs(await searchListings(anon(), parseFilters({ q: "quilpad" })))).toContain("sample-quillpad");
  });
  it("ranks an exact name match first", async () => {
    expect(slugs(await searchListings(anon(), parseFilters({ q: "Hookbin" })))[0]).toBe("sample-hookbin");
  });
  it("never returns hidden listings", async () => {
    for (const q of ["exchange", "pending", "restricted", "notes"]) {
      const r = slugs(await searchListings(anon(), parseFilters({ q })));
      for (const h of HIDDEN) expect(r).not.toContain(h);
    }
  });
  it("applies filters", async () => {
    const free = await searchListings(anon(), parseFilters({ pricing: "FREE" }));
    expect(free.items.every((i) => i.pricingModel === "FREE")).toBe(true);
    const os = await searchListings(anon(), parseFilters({ q: "code", openSource: "1" }));
    expect(slugs(os)).toEqual(["sample-openpilot-code"]);
    const cat = await searchListings(anon(), parseFilters({ category: "ai" }));
    expect(slugs(cat)).toEqual(expect.arrayContaining(["sample-orbit-chat", "sample-codewisp"]));
    expect(slugs(cat)).not.toContain("sample-lumen-notes");
    expect((await searchListings(anon(), parseFilters({ highlyRated: "1" }))).total).toBe(0); // no ratings exist
  });
  it("treats query syntax as text (no SQL/tsquery injection)", async () => {
    for (const q of ["'; DROP TABLE \"Listing\"; --", "a & | ! :*", "%", "_", "\\"]) {
      await expect(searchListings(anon(), parseFilters({ q }))).resolves.toBeDefined();
    }
    expect(await db.listing.count()).toBeGreaterThan(0);
  });
  it("paginates", async () => {
    const r = await searchListings(anon(), parseFilters({ page: "99" }));
    expect(r.items).toEqual([]);
    expect(r.pageCount).toBe(1);
  });
  it("suggests apps and categories", async () => {
    const s = await suggest(anon(), "lum");
    expect(s.apps[0]?.slug).toBe("sample-lumen-notes");
    expect((await suggest(anon(), "photo")).categories.map((c) => c.slug)).toContain("photography");
    expect((await suggest(anon(), "betting")).categories.map((c) => c.slug)).not.toContain("betting-gambling");
  });
});

describe("alternatives", () => {
  it("groups related listings", async () => {
    const codewisp = await db.listing.findUniqueOrThrow({ where: { slug: "sample-codewisp" } });
    const g = await getRelated(anon(), codewisp);
    expect(g.competitors.map((c) => c.slug)).toContain("sample-openpilot-code");
    expect(g.freeAlternatives.map((c) => c.slug)).toContain("sample-openpilot-code");
    expect(g.openSourceAlternatives.map((c) => c.slug)).toContain("sample-openpilot-code");
    expect(g.betterRated).toEqual([]); // no ratings exist
    const lumen = await db.listing.findUniqueOrThrow({ where: { slug: "sample-lumen-notes" } });
    const l = await getRelated(anon(), lumen);
    expect(l.similar[0]?.slug).toBe("sample-quillpad");
    expect(l.similar.map((c) => c.slug)).not.toContain("sample-security-restricted");
  });
});

describe("homepage", () => {
  it("shows only rails backed by real data", async () => {
    const { rails, collections } = await getHomepage(anon());
    const keys = rails.map((r) => r.key);
    expect(keys).toContain("featured");
    expect(keys).toContain("new");
    // Data-driven rails appear exactly when real data exists (never filled with fake items).
    const anyTrending = (await db.listing.count({ where: { status: "PUBLISHED", trendingScore: { gt: 0 } } })) > 0;
    const anyRated = (await db.listing.count({ where: { status: "PUBLISHED", ratingCount: { gte: 5 }, ratingAverage: { gte: 4 } } })) > 0;
    expect(keys.includes("trending")).toBe(anyTrending);
    expect(keys.includes("top-rated")).toBe(anyRated);
    expect(rails.find((r) => r.key === "recently-updated")?.items.map((i) => i.slug)).toEqual(expect.arrayContaining(["sample-lumen-notes", "sample-hookbin"]));
    expect(collections[0]?.items.length).toBeGreaterThan(0);
    for (const r of rails) for (const h of HIDDEN) expect(r.items.map((i) => i.slug)).not.toContain(h);
  });
});
