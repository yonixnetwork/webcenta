import { icons } from "lucide-react";
import { describe, expect, it } from "vitest";
import { TAXONOMY, flattenTaxonomy } from "@/server/catalog/taxonomy";
import { isValidSlug } from "@/lib/url";

describe("taxonomy", () => {
  const flat = flattenTaxonomy();
  it("has the main categories from the product brief", () => expect(TAXONOMY.length).toBeGreaterThanOrEqual(48));
  it("has unique, valid slugs", () => {
    const slugs = flat.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(isValidSlug(s), s).toBe(true);
  });
  it("uses only existing lucide icons", () => {
    for (const c of flat) expect(icons[c.icon as keyof typeof icons], `${c.slug}: ${c.icon}`).toBeDefined();
  });
  it("keeps regulated categories for adults, reviewed by a moderator; gambling stays hidden", () => {
    const bySlug = new Map(flat.map((c) => [c.slug, c]));
    for (const s of ["betting-gambling", "adult-entertainment", "forex", "cryptocurrency-exchanges", "sports-betting-platforms"]) {
      expect(bySlug.get(s)?.ageRating, s).toBe("AGE_18_PLUS");
      expect(bySlug.get(s)?.manualReview, s).toBe(true);
    }
    for (const s of ["betting-gambling", "sports-betting-platforms", "cryptocurrency-token-launchpads"]) expect(bySlug.get(s)?.restricted, s).toBe(true);
    expect(bySlug.get("medical")?.manualReview).toBe(true);
  });
});
