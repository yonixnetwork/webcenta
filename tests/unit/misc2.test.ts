import { describe, expect, it } from "vitest";
import { diversify } from "@/server/personalization/recommend";
import { renderMarkdown } from "@/lib/markdown";
import { maxStatus } from "@/server/scanner/monitor";
import { worst, maxSeverity } from "@/server/scanner/scan";
import { bayesian } from "@/server/analytics/ranking";
import { analyzeHtml } from "@/server/scanner/html";
import { levenshtein, registrableDomain, skeleton } from "@/server/scanner/domains";

const items = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }));

describe("recommendation diversity", () => {
  it("always includes items outside the user's interests", () => {
    const out = diversify(items("in", 20), items("out", 5), 12);
    expect(out).toHaveLength(12);
    expect(out.filter((x) => x.id.startsWith("out")).length).toBeGreaterThanOrEqual(3);
    expect(new Set(out.map((x) => x.id)).size).toBe(12);
  });
  it("fills with exploration when interests run out", () => {
    expect(diversify(items("in", 2), items("out", 5), 6).length).toBeGreaterThanOrEqual(5);
  });
});

describe("markdown renderer", () => {
  it("escapes HTML and only allows https/relative links", () => {
    const html = renderMarkdown(`# Title\n\n<script>alert(1)</script> **bold**\n\n- [ok](https://a.example)\n- [bad](javascript:alert(1))`);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('<a href="https://a.example"');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("<strong>bold</strong>");
  });
});

describe("security status and verdicts", () => {
  it("never lowers a status below the current one", () => {
    expect(maxStatus("UNDER_INVESTIGATION", "WARNING")).toBe("UNDER_INVESTIGATION");
    expect(maxStatus("PASSED", "RESTRICTED")).toBe("RESTRICTED");
  });
  it("worst verdict wins; SKIPPED never counts as a pass or failure", () => {
    expect(worst(["PASS", "SKIPPED", "WARN"])).toBe("WARN");
    expect(worst(["PASS", "INCONCLUSIVE"])).toBe("INCONCLUSIVE");
    expect(worst(["FAIL", "PASS"])).toBe("FAIL");
    expect(maxSeverity(["LOW", "CRITICAL", undefined, "HIGH"])).toBe("CRITICAL");
  });
});

describe("ranking", () => {
  it("bayesian average pulls few ratings towards the mean", () => {
    expect(bayesian(5, 1, 3.5)).toBeLessThan(3.7);
    expect(bayesian(5, 1000, 3.5)).toBeGreaterThan(4.9);
  });
});

describe("phishing heuristics inputs", () => {
  it("detects seed-phrase harvesting forms and verification meta tags", () => {
    expect(analyzeHtml(`<title>x</title><p>Enter your 12-word seed phrase to restore</p><textarea></textarea>`).asksForSeedPhrase).toBe(true);
    expect(analyzeHtml(`<p>Never share your seed phrase.</p>`).asksForSeedPhrase).toBe(false);
    expect(analyzeHtml(`<head><meta name="webcenta-verification" content="wc-abc"></head>`).metaVerification).toEqual(["wc-abc"]);
    expect(analyzeHtml(`<form action="https://evil.example/x"><input type="password"></form>`).passwordForms[0]?.action).toBe("https://evil.example/x");
  });
  it("detects look-alike domains", () => {
    expect(skeleton("paypa1")).toBe("paypal");
    expect(skeleton("xn--pypal-4ve")).toBe("paypal"); // Cyrillic а
    expect(levenshtein("binanse", "binance")).toBe(1);
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
  });
});
