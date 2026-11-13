import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { BASE, registerUser } from "./helpers";

/**
 * Screenshot evidence for docs/implementation-audit (opt-in: AUDIT_SHOTS=<folder name>).
 * Chromium emulation of each viewport; real iOS/Android devices are not available here.
 */
const PHASE = process.env.AUDIT_SHOTS;
test.skip(!PHASE, "set AUDIT_SHOTS=before|after to capture audit screenshots");

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "375x812", width: 375, height: 812, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "430x932", width: 430, height: 932, mobile: true },
  { name: "768x1024", width: 768, height: 1024, mobile: true },
  { name: "1024x768", width: 1024, height: 768, mobile: false },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, mobile: false },
];
const PAGES: Array<[string, string]> = [
  ["home", "/"], ["category-crypto", "/c/cryptocurrency"], ["games", "/c/games"], ["apps", "/apps"],
  ["search", "/search?q=notes"], ["app", "/app/sample-lumen-notes"], ["signin", "/signin"], ["signup", "/signup"],
];
const dir = `docs/implementation-audit/screenshots/${PHASE}`;

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe.configure({ mode: "serial" });

test("public pages at every viewport", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(dir, { recursive: true });
  const problems: string[] = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const [name, path] of PAGES) {
      const res = await page.goto(`${BASE}${path}`);
      if (!res || res.status() >= 400) { problems.push(`${vp.name} ${path} HTTP ${res?.status()}`); continue; }
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
      const o = await overflow(page);
      if (o > 1) problems.push(`${vp.name} ${path} horizontal overflow ${o}px`);
      await page.screenshot({ path: `${dir}/${name}-${vp.name}.jpg`, type: "jpeg", quality: 70 });
    }
    await ctx.close();
  }
  console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no overflow or HTTP problems");
});

test("signed-in views: account menu, saved, notifications", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  for (const vp of [VIEWPORTS[1]!, VIEWPORTS[4]!, VIEWPORTS[6]!]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await registerUser(page, `audit-${vp.name}-${Date.now()}@example.test`, "Audit User");
    await page.goto(`${BASE}/`);
    const menu = page.getByRole("button", { name: /account menu/i });
    if (await menu.count()) {
      await menu.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/account-menu-${vp.name}.jpg`, type: "jpeg", quality: 70 });
      await page.keyboard.press("Escape");
    } else {
      await page.screenshot({ path: `${dir}/account-menu-${vp.name}.jpg`, type: "jpeg", quality: 70 });
    }
    for (const [name, path] of [["saved", "/account/favorites"], ["notifications", "/account/notifications"]] as const) {
      await page.goto(`${BASE}${path}`);
      await expect(page.locator("h1:visible").first()).toBeVisible();
      await page.screenshot({ path: `${dir}/${name}-${vp.name}.jpg`, type: "jpeg", quality: 70 });
    }
    await ctx.close();
  }
});
