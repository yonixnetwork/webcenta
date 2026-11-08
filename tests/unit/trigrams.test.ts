import { describe, expect, it } from "vitest";
import { similarity, trigramToken, trigramTokens, trigramsOf } from "@/lib/trigrams";
import { searchDocument, touchesSearchFields, plainValue } from "@/server/search/document";
import { enumArray, stringArray } from "@/lib/json-arrays";

describe("trigrams (pg_trgm-compatible)", () => {
  it("pads words like pg_trgm", () => {
    expect([...trigramsOf("cat")].sort()).toEqual(["  c", " ca", "at ", "cat"].sort());
    expect(trigramsOf("Cat, CAT!").size).toBe(4);
  });
  it("scores identical words 1, unrelated 0 and typos above pg_trgm's 0.3 threshold", () => {
    expect(similarity("notion", "notion")).toBe(1);
    expect(similarity("notion", "zzzz")).toBe(0);
    expect(similarity("Lumen Notes", "lumen notse")).toBeGreaterThan(0.3);
    expect(similarity("Hookbin", "hokbin")).toBeGreaterThan(0.3);
    expect(similarity("Hookbin", "calendar")).toBeLessThan(0.3);
  });
  it("encodes trigrams as alphanumeric FULLTEXT tokens (no stopwords, ≥ 3 chars)", () => {
    expect(trigramToken("the")).toBe("t746865");
    expect(trigramToken("  é")).toBe("t2020c3a9");
    expect(trigramTokens("ab")).toMatch(/^(t[0-9a-f]+ ?)+$/);
  });
});

describe("search document", () => {
  it("joins every searchable field, including JSON features", () => {
    const d = searchDocument({ name: "Lumen", tagline: "Notes", publisherName: "Acme", features: ["Backlinks", 3, null], description: "Desc" });
    expect(d.searchText.split("\n")).toEqual(["Lumen", "Notes", "Acme", "Backlinks", "Desc"]);
    expect(d.searchTrigrams).toContain(trigramToken("lum"));
    expect(d.searchTrigrams).toContain(trigramToken("acm"));
  });
  it("detects content updates, including { set } values", () => {
    expect(touchesSearchFields({ status: "PUBLISHED" })).toBe(false);
    expect(touchesSearchFields({ description: { set: "x" } })).toBe(true);
    expect(plainValue({ set: "x" })).toBe("x");
    expect(plainValue(["a"])).toEqual(["a"]);
  });
});

describe("JSON array helpers", () => {
  it("reads only string members and tolerates bad data", () => {
    expect(stringArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(stringArray(null)).toEqual([]);
    expect(stringArray({ a: 1 })).toEqual([]);
    expect(enumArray(["WEB", "NOPE", "IOS"], ["WEB", "IOS"] as const)).toEqual(["WEB", "IOS"]);
  });
});
