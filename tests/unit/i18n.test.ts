import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, isLocalizablePath, localizePath, matchLanguage, normalizeLocale, parseAcceptLanguage, parseLocaleList, splitLocalePath } from "@/i18n/locales";
import { decideLocale, htmlAttrs } from "@/i18n/routing";
import { createT } from "@/i18n/translate";
import { checkCatalog } from "@/i18n/coverage";
import { hreflangProblems, languageAlternates, validateKeywords } from "@/i18n/seo-rules";
import { combineRules, type CountryRule } from "@/server/geo/country-policy";
import { viewerMaxRating } from "@/server/viewer";

const MESSAGES = join(__dirname, "..", "..", "src", "i18n", "messages");

describe("locale registry", () => {
  it("has 50 languages with valid, unique BCP 47 codes and lower-case prefixes", () => {
    expect(LOCALES).toHaveLength(50);
    expect(LOCALES.filter((l) => l.tier === 1)).toHaveLength(15);
    expect(LOCALES.filter((l) => l.tier === 2)).toHaveLength(25);
    expect(LOCALES.filter((l) => l.tier === 3)).toHaveLength(10);
    expect(LOCALES.at(-1)!.code).toBe("af");
    expect(new Set(LOCALES.map((l) => l.code)).size).toBe(50);
    for (const l of LOCALES) {
      expect(Intl.getCanonicalLocales(l.code)[0]).toBe(l.code);
      expect(l.prefix).toBe(l.code.toLowerCase());
      expect(l.native.length).toBeGreaterThan(1);
    }
    expect(LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code).sort()).toEqual(["ar", "fa", "he", "ur"]);
  });

  it("the proxy matcher lists every language prefix", () => {
    const proxy = readFileSync(join(__dirname, "..", "..", "src", "proxy.ts"), "utf8");
    const group = /:locale\(([^)]+)\)/.exec(proxy)![1]!.split("|").sort();
    expect(group).toEqual(LOCALES.map((l) => l.prefix).sort());
  });

  it("splits, builds and normalises localised paths", () => {
    expect(splitLocalePath("/es/app/notes")).toEqual({ locale: "es", path: "/app/notes", prefixed: true });
    expect(splitLocalePath("/pt-br")).toEqual({ locale: "pt-BR", path: "/", prefixed: true });
    expect(splitLocalePath("/apps")).toEqual({ locale: "en", path: "/apps", prefixed: false });
    expect(splitLocalePath("/espresso")).toMatchObject({ locale: "en", prefixed: false });
    expect(localizePath("/app/x?sort=new#r", "zh-Hans")).toBe("/zh-hans/app/x?sort=new#r");
    expect(localizePath("/", "ar")).toBe("/ar");
    expect(localizePath("/apps", "en")).toBe("/apps");
    expect(localizePath("/api/version", "es")).toBe("/api/version");
    expect(localizePath("/media/a.png", "es")).toBe("/media/a.png");
    expect(localizePath("https://example.com/", "es")).toBe("https://example.com/");
    expect(localizePath("//evil.example/x", "es")).toBe("//evil.example/x");
    expect(isLocalizablePath("/sitemap.xml")).toBe(false);
    expect(normalizeLocale("PT-br")).toBe("pt-BR");
    expect(normalizeLocale("xx")).toBeNull();
    expect(parseLocaleList("fr, es nope ar")).toEqual(["en", "es", "fr", "ar"]);
  });

  it("suggests a language from browser preferences without inventing one", () => {
    const allowed = ["en", "es", "zh-Hans", "zh-Hant", "pt-BR", "nb"];
    expect(matchLanguage(parseAcceptLanguage("es-MX,es;q=0.9,en;q=0.5"), allowed)).toBe("es");
    expect(matchLanguage(["zh-TW"], allowed)).toBe("zh-Hant");
    expect(matchLanguage(["zh-CN"], allowed)).toBe("zh-Hans");
    expect(matchLanguage(["pt-PT"], allowed)).toBeNull();
    expect(matchLanguage(["pt"], allowed)).toBe("pt-BR");
    expect(matchLanguage(["no"], allowed)).toBe("nb");
    expect(matchLanguage(["sw"], allowed)).toBeNull();
    expect(htmlAttrs("ar")).toEqual({ lang: "ar", dir: "rtl" });
    expect(htmlAttrs("bogus")).toEqual({ lang: "en", dir: "ltr" });
  });
});

describe("locale routing (proxy)", () => {
  const base = { search: "", method: "GET", cookieLocale: null, enabled: ["en", "es", "ar"], prefetch: false };
  it("serves prefixed pages from the same route", () => {
    expect(decideLocale({ ...base, pathname: "/es/app/x" })).toEqual({ kind: "serve", locale: "es", path: "/app/x" });
  });
  it("redirects /en and languages that are switched off to the unprefixed URL", () => {
    expect(decideLocale({ ...base, pathname: "/en/apps", search: "?q=1" })).toEqual({ kind: "redirect", location: "/apps?q=1", status: 308 });
    expect(decideLocale({ ...base, pathname: "/fr/apps" })).toEqual({ kind: "redirect", location: "/apps", status: 307 });
    expect(decideLocale({ ...base, pathname: "/es/api/version" })).toMatchObject({ kind: "redirect", location: "/api/version" });
  });
  it("never redirects to another host", () => {
    for (const pathname of ["/en//evil.example/x", "/fr//evil.example", "/en/\\evil.example", "//evil.example"]) {
      const d = decideLocale({ ...base, pathname, cookieLocale: "es" });
      if (d.kind === "redirect") {
        expect(d.location.startsWith("/")).toBe(true);
        expect(new URL(d.location, "https://webcenta.com").host).toBe("webcenta.com");
      }
    }
  });
  it("only a visitor's own choice redirects unprefixed pages, never prefetches, POSTs or crawlers", () => {
    expect(decideLocale({ ...base, pathname: "/apps", cookieLocale: "es" })).toEqual({ kind: "redirect", location: "/es/apps", status: 307 });
    expect(decideLocale({ ...base, pathname: "/apps", cookieLocale: "es", prefetch: true })).toMatchObject({ kind: "serve", locale: "en" });
    expect(decideLocale({ ...base, pathname: "/apps", cookieLocale: "es", method: "POST" })).toMatchObject({ kind: "serve" });
    expect(decideLocale({ ...base, pathname: "/apps", cookieLocale: "fr" })).toMatchObject({ kind: "serve", locale: "en" });
    expect(decideLocale({ ...base, pathname: "/apps", cookieLocale: "en" })).toMatchObject({ kind: "serve", locale: "en" });
    expect(decideLocale({ ...base, pathname: "/api/x", cookieLocale: "es" })).toMatchObject({ kind: "serve" });
    expect(decideLocale({ ...base, pathname: "/apps" })).toMatchObject({ kind: "serve", locale: "en" });
  });
});

describe("messages", () => {
  const en = { a: "Hello {name}", n: { one: "{count} app", other: "{count} apps", zero: "No apps" } };
  it("interpolates, pluralises per language and falls back to English, then the key", () => {
    const t = createT("fr", { n: { one: "{count} app", other: "{count} apps" } }, en);
    expect(t("a", { name: "Zoé" })).toBe("Hello Zoé");
    expect(t("n", { count: 1 })).toBe("1 app");
    expect(t("n", { count: 0 })).toBe("0 app"); // French: 0 is "one"
    expect(createT("en", en, en)("n", { count: 0 })).toBe("No apps");
    expect(createT("de", {}, en)("n", { count: 1200 })).toBe("1,200 apps");
    expect(createT("de", { n: { other: "{count} Apps" } }, en)("n", { count: 1200 })).toBe("1.200 Apps");
    expect(t("missing.key")).toBe("missing.key");
  });

  it("flags missing keys, markup, placeholder and plural mismatches", () => {
    const r = checkCatalog(en, { a: "Hola <b>{name}</b>", n: "x", extra: "y" });
    expect(r.missing).toEqual([]);
    expect(r.problems.map((p) => p.key).sort()).toEqual(["a", "extra", "n"]);
    expect(checkCatalog(en, { a: "Hallo {nom}" }).problems[0]!.problem).toMatch(/placeholders/);
    expect(checkCatalog(en, {}).missing).toEqual(["a", "n"]);
  });

  it("every bundled catalogue is valid (no unknown keys, markup or placeholder errors)", () => {
    for (const ns of readdirSync(MESSAGES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      const english = JSON.parse(readFileSync(join(MESSAGES, ns, "en.json"), "utf8"));
      for (const l of LOCALES) {
        const file = join(MESSAGES, ns, `${l.code}.json`);
        if (!existsSync(file)) continue;
        const r = checkCatalog(english, JSON.parse(readFileSync(file, "utf8")));
        expect(r.problems, `${ns}/${l.code}`).toEqual([]);
      }
    }
  });

  it("translation metadata never claims a review that did not happen", () => {
    const meta = JSON.parse(readFileSync(join(MESSAGES, "meta.json"), "utf8")) as Record<string, { source: string; reviewed: boolean }>;
    for (const [code, m] of Object.entries(meta)) {
      expect(LOCALES.some((l) => l.code === code)).toBe(true);
      if (m.source === "ai-draft") expect(m.reviewed).toBe(false);
    }
  });
});

describe("international SEO", () => {
  it("hreflang alternates are reciprocal, canonical and include x-default", () => {
    const indexed = ["en", "es", "zh-Hans", "ar"];
    const pages: Record<string, Record<string, string>> = {};
    for (const code of indexed) {
      const a = languageAlternates("/apps", code, indexed, "https://webcenta.com");
      pages[a.canonical] = a.languages;
    }
    expect(Object.keys(pages)).toEqual(["https://webcenta.com/apps", "https://webcenta.com/es/apps", "https://webcenta.com/zh-hans/apps", "https://webcenta.com/ar/apps"]);
    expect(pages["https://webcenta.com/es/apps"]!["x-default"]).toBe("https://webcenta.com/apps");
    expect(hreflangProblems(pages)).toEqual([]);
    expect(hreflangProblems({ "/a": { en: "/a", es: "/es/a" }, "/es/a": { es: "/es/a", "x-default": "/a" } }).length).toBeGreaterThan(0);
  });

  it("validates keywords (no duplicates, stuffing, links or markup)", () => {
    expect(validateKeywords("apps web, herramientas, Apps web").problems).toHaveLength(1);
    expect(validateKeywords(Array.from({ length: 11 }, (_, i) => `kw${i}`).join(",")).problems[0]).toMatch(/at most 10/);
    expect(validateKeywords("<script>, https://x.y").problems).toHaveLength(2);
    expect(validateKeywords("web apps\nonline tools").keywords).toEqual(["web apps", "online tools"]);
  });
});

describe("country policies", () => {
  const rules = new Map<string, CountryRule>([
    ["DE", { country: "DE", restrictedCategories: ["betting-gambling"], permittedCategories: [], adultAge: null, adsDisabled: false, disabledProviders: ["adsterra"] }],
    ["KR", { country: "KR", restrictedCategories: ["cryptocurrency"], permittedCategories: [], adultAge: 19, adsDisabled: true, disabledProviders: [] }],
  ]);
  it("restrictions of the detected and the chosen country add up (a chosen country cannot remove one)", () => {
    const r = combineRules(rules, ["KR", "DE"]);
    expect(r.restrictedCategories.sort()).toEqual(["betting-gambling", "cryptocurrency"]);
    expect(r).toMatchObject({ adultAge: 19, adsDisabled: true, disabledProviders: ["adsterra"] });
    expect(combineRules(rules, [null, null])).toEqual({ restrictedCategories: [], adultAge: null, adsDisabled: false, disabledProviders: [] });
  });
  it("choosing a country with a lower age of majority does not unlock adult content", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    const user = { maxAgeRating: "AGE_18_PLUS" as const, adultConfirmedAt: new Date(), birthDate: new Date("2008-01-01T00:00:00Z"), preferredCountry: "DE" };
    expect(viewerMaxRating(user, "DE", now)).toBe("AGE_18_PLUS");
    expect(viewerMaxRating(user, "KR", now)).toBe("AGE_16_PLUS"); // 18 in KR is below 19
    expect(viewerMaxRating({ ...user, preferredCountry: "KR" }, "DE", now)).toBe("AGE_16_PLUS");
    expect(viewerMaxRating(user, "DE", now, 21)).toBe("AGE_16_PLUS"); // admin minimum age
  });
});
