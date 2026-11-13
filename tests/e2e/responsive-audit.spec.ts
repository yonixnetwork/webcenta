import { mkdirSync, writeFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { BASE, registerUser } from "./helpers";

/**
 * Production-repair responsive audit (opt-in: RESPONSIVE_AUDIT=1). Every listed page at the ten
 * requested viewports in Chromium emulation: horizontal overflow, elements wider than the screen,
 * fixed tab bar position and console errors are recorded in
 * docs/production-repair/responsive-audit.json; screenshots for 320, 390, 768 and 1440 px.
 */
test.skip(!process.env.RESPONSIVE_AUDIT, "set RESPONSIVE_AUDIT=1 to run the responsive audit");
test.describe.configure({ mode: "serial" });

const VIEWPORTS = [
  { w: 320, h: 568, m: true }, { w: 360, h: 800, m: true }, { w: 375, h: 812, m: true }, { w: 390, h: 844, m: true }, { w: 430, h: 932, m: true },
  { w: 768, h: 1024, m: true }, { w: 1024, h: 768, m: false }, { w: 1280, h: 800, m: false }, { w: 1440, h: 900, m: false }, { w: 1920, h: 1080, m: false },
];
const SHOT_WIDTHS = new Set([320, 390, 768, 1440]);
const PUBLIC: Array<[string, string]> = [["home", "/"], ["games", "/c/games"], ["apps", "/apps"], ["search", "/search?q=notes"], ["app", "/app/sample-lumen-notes"], ["signin", "/signin"], ["signup", "/signup"]];
const ACCOUNT: Array<[string, string]> = [["account", "/account"], ["profile", "/account/profile"], ["security", "/account/security"], ["saved", "/account/favorites"], ["collections", "/account/collections"], ["reviews", "/account/reviews"], ["notifications", "/account/notifications"], ["recently-viewed", "/account/history"], ["privacy", "/account/privacy"]];
const dir = "docs/production-repair/screenshots/responsive";

async function inspect(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).position === "fixed") return false;
      // Inside a horizontal scroller is fine (rails of apps).
      for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return false; }
      return r.right > vw + 1 || r.left < -1;
    }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].slice(0, 3).join(".")}`);
    const nav = document.querySelector('nav[aria-label="Mobile"]')?.getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - vw, wide, navInside: !nav || !nav.width || (nav.left >= 0 && nav.right <= vw + 1 && nav.bottom <= window.innerHeight + 1) };
  });
}

test("every page at every viewport", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  mkdirSync(dir, { recursive: true });
  const results: Array<Record<string, unknown>> = [];
  const reg = await browser.newContext();
  const p0 = await reg.newPage();
  await registerUser(p0, `audit-${Date.now()}@example.test`, "Audit Person");
  const session = await reg.storageState();
  await reg.close();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, deviceScaleFactor: 1, storageState: session });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    for (const [name, path] of [...PUBLIC, ...ACCOUNT]) {
      errors.length = 0;
      const res = await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
      const r = await inspect(page);
      results.push({ viewport: `${vp.w}x${vp.h}`, page: path, status: res?.status(), ...r, consoleErrors: [...errors] });
      if (SHOT_WIDTHS.has(vp.w)) await page.screenshot({ path: `${dir}/${name}-${vp.w}x${vp.h}.jpg`, type: "jpeg", quality: 60 });
    }
    await ctx.close();
  }
  const problems = results.filter((r) => (r.status as number) >= 400 || (r.overflow as number) > 1 || (r.wide as string[]).length || !r.navInside || (r.consoleErrors as string[]).length);
  writeFileSync("docs/production-repair/responsive-audit.json", `${JSON.stringify({ generatedAt: new Date().toISOString(), engine: "Chromium (Playwright device emulation)", checks: results.length, problems }, null, 2)}\n`);
  console.log(`${results.length} page/viewport checks, ${problems.length} with problems`);
  for (const p of problems) console.log(JSON.stringify(p));
});
