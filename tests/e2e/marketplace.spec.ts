import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe("marketplace", () => {
  test("homepage shows real rails and no fabricated sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Find the right web app");
    await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "New on WebCenter" })).toBeVisible();
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
    await page.getByText("Filters").click();
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
    await expect(page.getByText("No reviews yet. Be the first to share your experience.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Competitors" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Free alternatives to CodeWisp/ })).toBeVisible();
    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(ld!)).toMatchObject({ "@type": "WebApplication", name: "CodeWisp" });
    expect(ld).not.toContain("aggregateRating");
  });

  test("visit website goes through the leaving-WebCenter notice", async ({ page, request }) => {
    await page.goto("/app/sample-lumen-notes");
    await page.getByRole("link", { name: /Visit website/ }).click();
    await expect(page).toHaveURL(/\/go\/sample-lumen-notes$/);
    await expect(page.getByRole("heading", { name: "You’re leaving WebCenter" })).toBeVisible();
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
    const dev = await request.get("/domains", { headers: { host: "developers.localhost:3100" }, maxRedirects: 0 });
    expect(dev.status()).toBe(308);
    expect(dev.headers()["location"]).toMatch(/\/developer\/domains$/);
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
