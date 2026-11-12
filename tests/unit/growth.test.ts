import { describe, expect, it } from "vitest";
import { ageOn, majorityAge, minRating, parseBirthDate, ratingForAge } from "@/lib/age";
import { encodeConsent, parseConsent } from "@/lib/consent";
import { cleanName, parseManifest, parseSiteHtml } from "@/server/importer/metadata";
import { validSubscription } from "@/server/push/push";
import { viewerMaxRating } from "@/server/viewer";
import { catalogueEntries, CATALOGUE } from "@/server/importer/catalogue";
import { flattenTaxonomy, TAXONOMY, TOP_LEVEL_ORDER } from "@/server/catalog/taxonomy";

describe("age rules", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  it("computes whole years and handles birthdays", () => {
    expect(ageOn(new Date("2008-11-12T00:00:00Z"), now)).toBe(18);
    expect(ageOn(new Date("2008-11-13T00:00:00Z"), now)).toBe(17);
  });
  it("maps age to the highest allowed rating, with the local age of majority", () => {
    expect(ratingForAge(12)).toBe("ALL_AGES");
    expect(ratingForAge(13)).toBe("AGE_13_PLUS");
    expect(ratingForAge(17)).toBe("AGE_16_PLUS");
    expect(ratingForAge(18)).toBe("AGE_18_PLUS");
    expect(majorityAge("KR")).toBe(19);
    expect(ratingForAge(18, "KR")).toBe("AGE_16_PLUS");
    expect(ratingForAge(20, "SG")).toBe("AGE_16_PLUS");
  });
  it("parses only real, plausible dates", () => {
    expect(parseBirthDate("1990-05-01")?.toISOString()).toBe("1990-05-01T00:00:00.000Z");
    expect(parseBirthDate("1990-13-40")).toBeNull();
    expect(parseBirthDate("3000-01-01")).toBeNull();
    expect(parseBirthDate("1800-01-01")).toBeNull();
    expect(parseBirthDate(42)).toBeNull();
  });
  it("a viewer never sees more than their age allows, whatever their preference", () => {
    const minor = { maxAgeRating: "AGE_18_PLUS" as const, adultConfirmedAt: new Date(), birthDate: new Date("2012-01-01T00:00:00Z") };
    expect(viewerMaxRating(minor, null, now)).toBe("AGE_13_PLUS");
    const adult = { maxAgeRating: "AGE_18_PLUS" as const, adultConfirmedAt: new Date(), birthDate: new Date("1990-01-01T00:00:00Z") };
    expect(viewerMaxRating(adult, null, now)).toBe("AGE_18_PLUS");
    expect(viewerMaxRating({ ...adult, maxAgeRating: "AGE_16_PLUS" }, null, now)).toBe("AGE_16_PLUS");
    expect(viewerMaxRating(null, null, now)).toBe("AGE_16_PLUS");
    expect(viewerMaxRating({ maxAgeRating: "AGE_18_PLUS", adultConfirmedAt: null, birthDate: null }, null, now)).toBe("AGE_16_PLUS");
    expect(minRating("AGE_18_PLUS", "AGE_13_PLUS")).toBe("AGE_13_PLUS");
  });
});

describe("cookie consent value", () => {
  it("round-trips and rejects anything else", () => {
    expect(parseConsent(encodeConsent({ analytics: true, ads: false }))).toEqual({ analytics: true, ads: false });
    expect(parseConsent("v1.a1.d1")).toEqual({ analytics: true, ads: true });
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});

describe("site metadata for imports", () => {
  const html = `<!doctype html><html lang="en-GB"><head><title>Acme Notes – Write faster | Acme</title>
    <meta name="description" content="Acme Notes is a fast note-taking app."><meta property="og:image" content="/og.jpg">
    <meta name="viewport" content="width=device-width"><link rel="manifest" href="/site.webmanifest">
    <link rel="icon" sizes="32x32" href="/f32.png"><link rel="icon" href="/logo.svg"><link rel="apple-touch-icon" href="/touch.png"></head>
    <body><a href="/legal/privacy-policy">Privacy</a><a href="/tos">Terms of service</a><a href="/pricing">Pricing</a> Free forever</body></html>`;
  it("reads name, description, images, manifest and policy links", () => {
    const m = parseSiteHtml(html, "https://acme.example/");
    expect(m.name).toBe("Acme");
    expect(m.description).toBe("Acme Notes is a fast note-taking app.");
    expect(m.lang).toBe("en-gb");
    expect(m.iconUrls[0]).toBe("https://acme.example/touch.png");
    expect(m.iconUrls).not.toContain("https://acme.example/logo.svg");
    expect(m.imageUrls).toEqual(["https://acme.example/og.jpg"]);
    expect(m.manifestUrl).toBe("https://acme.example/site.webmanifest");
    expect(m.privacyUrl).toBe("https://acme.example/legal/privacy-policy");
    expect(m.termsUrl).toBe("https://acme.example/tos");
    expect(m.hasPricingPage && m.mentionsFree && m.mobileFriendly).toBe(true);
  });
  it("prefers og:site_name and short title parts", () => {
    expect(cleanName("Notion – The all-in-one workspace | Notion", null)).toBe("Notion");
    expect(cleanName("Anything", "Figma")).toBe("Figma");
  });
  it("reads manifests: largest raster icon first, wide screenshots first, no SVG", () => {
    const m = parseManifest(JSON.stringify({ name: "Acme", display: "standalone", icons: [{ src: "a.png", sizes: "192x192" }, { src: "b.png", sizes: "512x512" }, { src: "c.svg", type: "image/svg+xml" }], screenshots: [{ src: "narrow.png" }, { src: "wide.png", form_factor: "wide" }] }), "https://acme.example/m/site.webmanifest");
    expect(m.iconUrls).toEqual(["https://acme.example/m/b.png", "https://acme.example/m/a.png"]);
    expect(m.screenshotUrls[0]).toBe("https://acme.example/m/wide.png");
    expect(m.standalone).toBe(true);
    expect(parseManifest("not json", "https://x.example/").iconUrls).toEqual([]);
  });
});

describe("web push subscriptions", () => {
  const keys = { p256dh: "BNcR", auth: "tBHI" };
  it("accepts only https endpoints of real push services", () => {
    expect(validSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys })).toBe(true);
    expect(validSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys })).toBe(true);
    expect(validSubscription({ endpoint: "https://web.push.apple.com/abc", keys })).toBe(true);
    expect(validSubscription({ endpoint: "https://wns2-par02p.notify.windows.com/w/?token=abc", keys })).toBe(true);
    expect(validSubscription({ endpoint: "https://evil.example/collect", keys })).toBe(false);
    expect(validSubscription({ endpoint: "http://fcm.googleapis.com/x", keys })).toBe(false);
    expect(validSubscription({ endpoint: "https://fcm.googleapis.com.evil.example/x", keys })).toBe(false);
    expect(validSubscription({ endpoint: "https://fcm.googleapis.com/x" })).toBe(false);
  });
});

describe("taxonomy and catalogue", () => {
  it("has every store category, and each top-level category has a position", () => {
    const slugs = new Set(flattenTaxonomy().map((n) => n.slug));
    for (const s of ["books-reading", "utilities-converters", "entertainment", "sports", "business", "finance", "education", "health-fitness", "travel", "productivity", "children-family", "reference", "music-audio", "news-magazines", "art-design", "medical", "lifestyle", "shopping", "weather", "photography", "developer-tools", "ar-vr", "food-drink", "beauty", "comics", "dating", "communication", "libraries-demo", "maps-navigation", "parenting", "cryptocurrency", "forex", "trading", "cryptocurrency-decentralized-exchanges-dex", "cryptocurrency-dex-screeners", "cryptocurrency-wallets", "adult-entertainment", "events", "personalization"]) {
      expect(slugs.has(s), s).toBe(true);
    }
    expect([...TOP_LEVEL_ORDER].sort()).toEqual(TAXONOMY.map((n) => n.slug).sort());
    expect(flattenTaxonomy().length).toBe(slugs.size); // no duplicate slugs
  });
  it("adult content is visible to adults only and crypto exchanges are no longer hidden", () => {
    const flat = flattenTaxonomy();
    const adult = flat.find((n) => n.slug === "adult-entertainment")!;
    expect(adult.ageRating).toBe("AGE_18_PLUS");
    expect(adult.restricted).toBeFalsy();
    expect(flat.find((n) => n.slug === "cryptocurrency-exchanges")!.restricted).toBeFalsy();
    expect(flat.find((n) => n.slug === "betting-gambling")!.restricted).toBe(true);
  });
  it("the catalogue only uses existing categories, has no duplicates and skips sensitive ones", () => {
    const slugs = new Set(flattenTaxonomy().map((n) => n.slug));
    expect(Object.keys(CATALOGUE).filter((k) => !slugs.has(k))).toEqual([]);
    const urls = catalogueEntries().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBeGreaterThan(1000);
    expect(CATALOGUE["adult-entertainment"]).toBeUndefined();
    expect(CATALOGUE["betting-gambling"]).toBeUndefined();
    for (const u of urls) expect(u).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/);
  });
});
