import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settle, sql } from "./helpers";

test.describe("marketplace", () => {
  test("homepage shows real rails and no fabricated sections", async ({ page }) => {
    await page.goto("/");
    // Phones: a large "Discover" title like the app stores; wider screens: the introduction.
    const phone = (page.viewportSize()?.width ?? 1280) < 640;
    await expect(page.getByRole("heading", { level: 1 }).locator("visible=true")).toContainText(phone ? "Discover" : "Find the right web app");
    await expect(page.getByRole("region", { name: "Featured" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New on Webcenta" })).toBeVisible();
    // Data-driven rails appear only when real data exists (never fabricated).
    const trending = Number((await sql<{ n: string }>(`select count(*) n from "Listing" where status = 'PUBLISHED' and "trendingScore" > 0`))[0]!.n);
    const rated = Number((await sql<{ n: string }>(`select count(*) n from "Listing" where status = 'PUBLISHED' and "ratingCount" >= 5 and "ratingAverage" >= 4`))[0]!.n);
    await expect(page.getByRole("heading", { name: "Trending now" })).toHaveCount(trending > 0 ? 1 : 0);
    await expect(page.getByRole("heading", { name: "Highly rated" })).toHaveCount(rated > 0 ? 1 : 0);
    await expect(page.getByText("Sample", { exact: true }).first()).toBeVisible();
  });

  test("no horizontal overflow", async ({ page }) => {
    for (const path of ["/", "/categories", "/app/sample-lumen-notes", "/search?q=notes"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(1);
    }
  });

  test("search autocomplete navigates to an app", async ({ page }) => {
    await page.goto("/search");
    const box = page.getByRole("combobox").first();
    await box.fill("lume");
    const option = page.getByRole("option", { name: /Lumen Notes/ });
    await expect(option).toBeVisible();
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/app\/sample-lumen-notes$/);
    await expect(page.getByRole("heading", { level: 1, name: "Lumen Notes" })).toBeVisible();
  });

  test("filters narrow results and are reflected in the URL", async ({ page }) => {
    await page.goto("/search?q=code");
    await page.locator("summary", { hasText: "Filters" }).click();
    await page.getByLabel("Open source").check();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/openSource=1/);
    await expect(page.getByRole("link", { name: /OpenPilot Code/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /CodeWisp/ })).toHaveCount(0);
  });

  test("detail page shows honest trust information and alternatives", async ({ page }) => {
    await page.goto("/app/sample-codewisp");
    // Status depends on whether monitoring has run yet; wording is never "safe".
    await expect(page.getByText(/^Security scan: (Not yet scanned|No issues detected|Warning|Under investigation)$/)).toBeVisible();
    await expect(page.getByText("Last verified")).toBeVisible();
    await expect(page.getByText(/guaranteed safe/i)).toHaveCount(0);
    await expect(page.getByText("No reviews yet. Be the first to review this application.")).toBeVisible();
    await expect(page.getByTestId("rating-summary")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Free alternatives to CodeWisp/ })).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(ld!)).toMatchObject({ "@type": "WebApplication", name: "CodeWisp" });
    expect(ld).not.toContain("aggregateRating");
  });

  test("visit website goes through the leaving-Webcenta notice", async ({ page, request }) => {
    await page.goto("/app/sample-lumen-notes");
    await page.getByRole("link", { name: /Visit website/ }).click();
    await expect(page).toHaveURL(/\/go\/sample-lumen-notes$/);
    await expect(page.getByRole("heading", { name: "You’re leaving Webcenta" })).toBeVisible();
    await expect(page.getByText("lumen-notes.example", { exact: true })).toBeVisible();
    const res = await request.post("/go/sample-lumen-notes/continue?url=https://evil.example", { maxRedirects: 0, form: { surface: "detail" } });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("https://lumen-notes.example/");
  });

  test("hidden listings and restricted categories return 404", async ({ request }) => {
    for (const p of ["/app/sample-hidden-exchange", "/app/sample-pending-review", "/app/sample-security-restricted", "/c/betting-gambling", "/go/sample-pending-review"]) {
      expect((await request.get(p)).status(), p).toBe(404);
    }
  });

  test("theme toggle persists", async ({ page, context }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /theme/ }).first();
    await toggle.click(); // system -> light
    await toggle.click(); // light -> dark
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect((await context.cookies()).find((c) => c.name === "wc-theme")?.value).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("report form submits", async ({ page }) => {
    await page.goto("/app/sample-paperfold-pdf");
    await page.getByRole("button", { name: "Report listing" }).click();
    await page.getByLabel("Website broken or unavailable").check();
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByRole("status")).toContainText("received");
  });

  test("no serious accessibility violations on key pages", async ({ page }) => {
    for (const path of ["/", "/categories", "/c/ai", "/app/sample-lumen-notes", "/search?q=notes", "/go/sample-lumen-notes", "/signin", "/signup", "/forgot-password", "/contact", "/legal/terms", "/about", "/offline"]) {
      await page.goto(path);
      await settle(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), path).toEqual([]);
    }
  });
});

test.describe("hosts and SEO", () => {
  test("www redirects, admin host is noindex and isolated", async ({ request }) => {
    const www = await request.get("/c/ai?x=1", { headers: { host: "www.localhost:3100" }, maxRedirects: 0 });
    expect(www.status()).toBe(308);
    // Next.js relativises same-origin Locations; with distinct production hosts it is absolute
    // (verified in CI by scripts/check-www-redirect.sh).
    expect(www.headers()["location"]).toMatch(/^(http:\/\/localhost:3100)?\/c\/ai\?x=1$/);
    const admin = await request.get("/login", { headers: { host: "admin.localhost:3100" } });
    expect(admin.headers()["x-robots-tag"]).toContain("noindex");
    expect(await admin.text()).toContain("Administrator accounts are separate");
    expect((await request.get("/", { headers: { host: "admin.localhost:3100" }, maxRedirects: 0 })).status()).toBe(307); // → /login
    // The developer portal is its own site; old marketplace links move there.
    const dev = await request.get("/signin", { headers: { host: "developers.localhost:3100" } });
    expect(dev.status()).toBe(200);
    expect(await dev.text()).toContain("Developer sign in");
    expect(dev.headers()["x-robots-tag"]).toContain("noindex");
    const old = await request.get("/developer/domains", { maxRedirects: 0 });
    expect(old.status()).toBe(308);
    expect(old.headers()["location"]).toBe("http://developers.localhost:3100/domains");
    expect(await (await request.get("/robots.txt", { headers: { host: "developers.localhost:3100" } })).text()).toContain("Disallow: /");
    expect((await request.get("/app/sample-lumen-notes", { headers: { host: "admin.localhost:3100" } })).status()).toBe(404);
    expect((await request.get("/admin-host")).status()).toBe(404);
    expect(await (await request.get("/robots.txt", { headers: { host: "admin.localhost:3100" } })).text()).toContain("Disallow: /");
  });
  test("sitemap excludes sample and hidden listings; robots points to it", async ({ request }) => {
    const sm = await (await request.get("/sitemap.xml")).text();
    expect(sm).toContain("/c/ai");
    expect(sm).not.toContain("sample-");
    expect(sm).not.toContain("betting-gambling");
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: http://localhost:3100/sitemap.xml");
  });
  test("security headers are present", async ({ request }) => {
    const h = (await request.get("/")).headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
  });
  test("cron endpoint requires the secret", async ({ request }) => {
    expect((await request.post("/api/cron/tick")).status()).toBe(401);
    expect((await request.post("/api/cron/tick", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
    const ok = await request.post("/api/cron/tick", { headers: { authorization: `Bearer ${process.env.APP_CRON_SECRET}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty("runId");
  });
});

test.describe("error pages", () => {
  test("invalid URLs return a real 404 with the branded page, search and popular categories", async ({ page }) => {
    for (const path of ["/does-not-exist", "/a/b/c/d", "/c/not-a-category", "/collections/nope-nope", "/legal/not-a-policy", "/search/extra", "/%E2%98%83", "/app/"]) {
      const res = await page.goto(path);
      expect(res!.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(/Page not found|Application not found/);
      await expect(page.getByRole("link", { name: /Go to the homepage/ }), path).toBeVisible();
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute("content", /noindex/);
    }
    await page.goto("/does-not-exist");
    await expect(page.getByRole("navigation", { name: "Popular categories" }).getByRole("link")).toHaveCount(8);
    await page.getByRole("searchbox", { name: "Search Webcenta" }).fill("notes");
    await page.getByRole("searchbox", { name: "Search Webcenta" }).press("Enter");
    await expect(page).toHaveURL(/\/search\?q=notes/);
    await page.goto("/does-not-exist");
    await page.getByRole("navigation", { name: "Popular categories" }).getByRole("link", { name: "Productivity" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Productivity" })).toBeVisible();
  });

  test("unknown API paths return JSON 404, not HTML", async ({ request }) => {
    const res = await request.get("/api/does-not-exist/at/all");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Not found" });
    expect((await request.post("/api/nope")).status()).toBe(404);
  });

  test("an unavailable app suggests alternatives without revealing moderation details", async ({ page }) => {
    // Published once, now hidden (restricted category) → named, generic reason, suggestions.
    const res = await page.goto("/app/sample-hidden-exchange");
    expect(res!.status()).toBe(404);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(/isn’t available$/);
    await expect(page.getByText(/may have been removed, may be temporarily unavailable, or may not be offered in your region/)).toBeVisible();
    const main = (await page.locator("main").innerText()).toLowerCase();
    for (const word of ["suspend", "restricted category", "legal review", "malware", "phishing", "moderat", "investigat", "violation"]) expect(main, word).not.toContain(word);
    await expect(page.getByRole("heading", { level: 2 }).filter({ hasText: /More in|Similar apps|Popular on Webcenta/ }).first()).toBeVisible();
    // Every suggestion is itself publicly reachable.
    const hrefs = await page.locator('main a[href^="/app/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of new Set(hrefs)) expect((await page.request.get(h)).status(), h).toBe(200);

    // Never published (under review) → not named at all.
    expect((await page.goto("/app/sample-pending-review"))!.status()).toBe(404);
    await expect(h1).toHaveText("Application not found");
    expect(await page.locator("main").innerText()).not.toContain("Pending");

    // Unknown slug → generic, with popular apps.
    expect((await page.goto("/app/zz-no-such-app"))!.status()).toBe(404);
    await expect(h1).toHaveText("Application not found");
    await expect(page.getByRole("heading", { name: "Popular on Webcenta" })).toBeVisible();
  });

  test("server errors render the branded 500 page with a working retry", async ({ page }) => {
    const res = await page.goto("/e2e-test/server-error");
    expect(res!.status()).toBe(500);
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong on our side" })).toBeVisible();
    await expect(page.getByText(/Reference:/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Something went wrong on our side" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to the homepage/ })).toBeVisible();
  });

  test("static fallback error pages are self-contained with a strict CSP", async ({ page, request }) => {
    for (const code of ["404", "500", "502", "503"]) {
      const res = await request.get(`/errors/${code}.html`);
      expect(res.status(), code).toBe(200);
      expect(res.headers()["content-security-policy"], code).toContain("default-src 'none'");
      expect(res.headers()["x-robots-tag"], code).toBe("noindex");
      const html = await res.text();
      expect(html, code).toContain(`Error ${code}`);
      expect(html, code).not.toContain("<script");
    }
    const failed: string[] = [];
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("console", (m) => { if (m.type() === "error") failed.push(m.text()); });
    await page.goto("/errors/503.html");
    await expect(page.getByRole("heading", { level: 1, name: "Webcenta is temporarily unavailable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "");
    expect(failed).toEqual([]);
  });
});
