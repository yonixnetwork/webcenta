import { describe, expect, it } from "vitest";
import { escapeLike, filtersToQuery, normalizeQueryForStats, parseFilters, prefixTsQuery } from "@/lib/search-params";

describe("parseFilters", () => {
  it("parses valid params", () => {
    const f = parseFilters({ q: " notes ", pricing: ["FREE", "PAID"], openSource: "1", sort: "newest", page: "2", country: "gb" });
    expect(f).toMatchObject({ q: "notes", pricing: ["FREE", "PAID"], openSource: true, sort: "newest", page: 2, country: "GB" });
  });
  it("is lenient with invalid input", () => {
    const f = parseFilters({ pricing: "FREE,BOGUS", sort: "evil", page: "-4", category: "../x", platform: "AMIGA" });
    expect(f).toMatchObject({ pricing: ["FREE"], sort: undefined, page: 1, category: undefined, platform: undefined, openSource: false });
  });
  it("round-trips through filtersToQuery", () => {
    const f = parseFilters({ q: "a b", pricing: "FREE", pwa: "1", page: "3" });
    expect(filtersToQuery(f)).toBe("?q=a+b&pricing=FREE&pwa=1&page=3");
  });
});

describe("prefixTsQuery", () => {
  it("sanitises tsquery syntax", () => {
    expect(prefixTsQuery("note's & | ! (app):*")).toBe("note:* & s:* & app:*");
    expect(prefixTsQuery("!!!")).toBeNull();
  });
  it("keeps unicode letters", () => expect(prefixTsQuery("café 東京")).toBe("café:* & 東京:*"));
});

describe("cleanText", () => {
  it("strips NUL and control characters", () => {
    expect(parseFilters({ q: "no\u0000tes\u0007" }).q).toBe("no tes");
    expect(parseFilters({ q: "\u0000" }).q).toBeUndefined();
  });
});

describe("escapeLike", () => {
  it("escapes wildcards", () => expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\"));
});

describe("normalizeQueryForStats", () => {
  it("normalises", () => expect(normalizeQueryForStats("  Note   Apps ")).toBe("note apps"));
  it.each(["me@example.com", "https://x.com", "www.site", "call 0123456789", "a"])("drops possibly personal or trivial %s", (q) =>
    expect(normalizeQueryForStats(q)).toBeNull());
});
