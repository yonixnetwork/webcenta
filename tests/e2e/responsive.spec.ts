import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { settle } from "./helpers";

/** Every public page on desktop, tablet and mobile, in light and dark themes. */
const PAGES = [
  "/", "/categories", "/c/ai", "/c/productivity-notes", "/search", "/search?q=notes&pricing=FREE&openSource=1", "/app/sample-lumen-notes",
  "/app/sample-codewisp/alternatives", "/go/sample-lumen-notes", "/collections/sample-student-starter-kit", "/about", "/contact",
  "/legal/terms", "/legal/privacy", "/signin", "/signup", "/forgot-password", "/reset-password", "/offline", "/does-not-exist",
  "/app/does-not-exist", "/app/sample-hidden-exchange", "/errors/404.html", "/errors/503.html",
];
const NOT_FOUND = new Set(["/does-not-exist", "/app/does-not-exist", "/app/sample-hidden-exchange"]);

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test(`all public pages render without overflow or console errors (${theme})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(`${page.url()}: ${m.text()}`); });
      for (const path of PAGES) {
        const res = await page.goto(path);
        expect(res!.status(), path).toBe(NOT_FOUND.has(path) ? 404 : 200);
        await expect(page.locator("h1").first(), path).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
        const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(bg, path).toBe(theme === "dark" ? "rgb(11, 12, 17)" : "rgb(247, 247, 251)");
      }
      expect(errors).toEqual([]);
    });
  });
}

test("no serious accessibility violations in dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/", "/app/sample-lumen-notes", "/search?q=notes", "/signin", "/categories", "/does-not-exist", "/app/sample-hidden-exchange", "/offline", "/errors/404.html", "/errors/503.html"]) {
    await page.goto(path);
    await settle(page);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target}`), path).toEqual([]);
  }
});

test("every internal link reachable from public navigation resolves", async ({ page, request }) => {
  const seen = new Set<string>();
  const queue = ["/", "/categories", "/app/sample-lumen-notes", "/about"];
  const broken: string[] = [];
  while (queue.length && seen.size < 250) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await request.get(path, { maxRedirects: 0 });
    // 307 = sign-in required (account/developer); everything else must be OK.
    if (![200, 307, 308].includes(res.status())) broken.push(`${path} → ${res.status()}`);
    if (res.status() !== 200 || !(res.headers()["content-type"] ?? "").includes("text/html")) continue;
    if (seen.size > 40) continue; // crawl depth limit; still checks every discovered link
    await page.goto(path);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")!).filter((h) => h.startsWith("/") && !h.startsWith("//")));
    for (const h of hrefs) { const clean = h.split("#")[0]!; if (clean && !seen.has(clean)) queue.push(clean); }
  }
  expect(broken).toEqual([]);
  expect(seen.size).toBeGreaterThan(30);
});

test("every navigation button works: header, mobile tabs, footer", async ({ page }) => {
  await page.goto("/");
  const phone = (page.viewportSize()?.width ?? 1280) < 640; // the tab bar is shown below the sm breakpoint
  if (phone) {
    for (const [label, path] of [["Categories", "/categories"], ["Search", "/search"], ["Discover", "/"]] as const) {
      await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}`));
    }
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Categories" }).click();
    await expect(page).toHaveURL(/\/categories$/);
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/signin/);
  }
  for (const [label, re] of [["Contact & support", /\/contact$/], ["Terms", /\/legal\/terms$/], ["About & how listings are checked", /\/about$/]] as const) {
    await page.getByRole("contentinfo").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(re);
  }
});
