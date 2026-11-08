import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { basedOnLabel, formatAverage, starFills, summarizeRatings } from "@/lib/ratings";
import { POPULAR_CATEGORIES } from "@/lib/popular-categories";
import { STATIC_ERROR_CSP, staticErrorPage, type StaticErrorCode } from "@/lib/static-error-pages";
import { CATEGORY_EMOJI, TAXONOMY } from "@/server/catalog/taxonomy";
import { testRoutesEnabled } from "@/server/test-routes";

const dist = (c5: number, c4: number, c3: number, c2: number, c1: number) => [
  { rating: 5, count: c5 }, { rating: 4, count: c4 }, { rating: 3, count: c3 }, { rating: 2, count: c2 }, { rating: 1, count: c1 },
];

describe("rating summary", () => {
  it("is empty with no ratings (no fabricated average)", () => {
    const s = summarizeRatings(dist(0, 0, 0, 0, 0));
    expect(s.total).toBe(0);
    expect(s.average).toBeNull();
    expect(s.rows.map((r) => r.percent)).toEqual([0, 0, 0, 0, 0]);
  });

  it.each([1, 2, 3, 4, 5])("a single %i-star rating averages exactly %i", (n) => {
    const s = summarizeRatings([{ rating: n, count: 1 }]);
    expect(s.total).toBe(1);
    expect(s.average).toBe(n);
    expect(s.rows.find((r) => r.rating === n)!.percent).toBe(100);
    expect(s.rows.filter((r) => r.rating !== n).every((r) => r.count === 0 && r.percent === 0)).toBe(true);
  });

  it("computes the mean of all five values and rounds to one decimal", () => {
    // 5+4+3+2+1 = 15 / 5 = 3.0
    expect(summarizeRatings(dist(1, 1, 1, 1, 1)).average).toBe(3);
    // (5*8 + 4*2) / 10 = 4.8
    expect(summarizeRatings(dist(8, 2, 0, 0, 0)).average).toBe(4.8);
    // (5*2 + 4*1) / 3 = 4.666… → 4.7
    expect(summarizeRatings(dist(2, 1, 0, 0, 0)).average).toBe(4.7);
  });

  it("percentages always sum to 100 and keep zero rows at 0%", () => {
    for (const d of [dist(1, 1, 1, 0, 0), dist(2, 1, 0, 0, 0), dist(1, 1, 1, 1, 1), dist(7, 0, 3, 0, 1), dist(1, 0, 0, 0, 2)]) {
      const s = summarizeRatings(d);
      expect(s.rows.reduce((a, r) => a + r.percent, 0)).toBe(100);
      for (const r of s.rows) if (r.count === 0) expect(r.percent).toBe(0);
    }
    expect(summarizeRatings(dist(1, 1, 1, 0, 0)).rows.map((r) => r.percent)).toEqual([34, 33, 33, 0, 0]);
  });

  it("formats labels", () => {
    expect(formatAverage(4.8)).toBe("4.8/5");
    expect(formatAverage(5)).toBe("5.0/5");
    expect(basedOnLabel(1)).toBe("Based on 1 review");
    expect(basedOnLabel(1234)).toBe("Based on 1,234 reviews");
    expect(starFills(3.5)).toEqual([1, 1, 1, 0.5, 0]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("categories used by error pages and emojis", () => {
  const top = new Map(TAXONOMY.map((n) => [n.slug, n.name]));
  it("popular categories exist in the taxonomy with the same names", () => {
    for (const c of POPULAR_CATEGORIES) expect(top.get(c.slug)).toBe(c.name);
  });
  it("every top-level category has exactly one emoji and no unknown keys", () => {
    for (const slug of top.keys()) expect(CATEGORY_EMOJI[slug], slug).toBeTruthy();
    for (const slug of Object.keys(CATEGORY_EMOJI)) expect(top.has(slug), slug).toBe(true);
  });
});

describe("static error pages", () => {
  const codes: StaticErrorCode[] = ["404", "500", "502", "503"];
  it.each(codes)("public/errors/%s.html is generated from the source module", (code) => {
    const onDisk = readFileSync(join(process.cwd(), "public", "errors", `${code}.html`), "utf8");
    expect(onDisk).toBe(staticErrorPage(code));
  });
  it.each(codes)("%s page is self-contained and branded", (code) => {
    const html = staticErrorPage(code);
    expect(html).toContain("Web<b>centa</b>");
    expect(html).toContain(`Error ${code}`);
    expect(html).not.toMatch(/<script|https?:\/\/(?!www\.w3)/i);
    expect(html).toContain('href="/"');
  });
  it("404 offers search and popular categories; 5xx offer a retry", () => {
    expect(staticErrorPage("404")).toContain('action="/search"');
    expect(staticErrorPage("404")).toContain('href="/c/ai"');
    for (const c of ["500", "502", "503"] as const) expect(staticErrorPage(c)).toContain('href="">Try again');
  });
  it("CSP forbids scripts", () => {
    expect(STATIC_ERROR_CSP).toContain("default-src 'none'");
    expect(STATIC_ERROR_CSP).not.toContain("script-src");
  });
});

describe("test-only error routes guard", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("is off unless explicitly enabled on a localhost origin", () => {
    vi.stubEnv("ENABLE_TEST_ERROR_ROUTES", "");
    vi.stubEnv("PUBLIC_ORIGIN", "http://localhost:3100");
    expect(testRoutesEnabled()).toBe(false);
    vi.stubEnv("ENABLE_TEST_ERROR_ROUTES", "true");
    expect(testRoutesEnabled()).toBe(true);
    vi.stubEnv("PUBLIC_ORIGIN", "https://webcenta.com");
    expect(testRoutesEnabled()).toBe(false);
    vi.stubEnv("PUBLIC_ORIGIN", "https://localhost.webcenta.com");
    expect(testRoutesEnabled()).toBe(false);
  });
});
