import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";
import { ADMIN, BASE, closeDb, freshTotp, markTotpUsed, provisionAdmin, sql, totp } from "./helpers";

/**
 * Languages, country rules, card navigation and the fixed bottom elements (tab bar and prompts).
 * Screenshots go to docs/international-expansion/screenshots when INTL_SHOTS=1.
 */
test.describe.configure({ mode: "serial" });
const RUN = `i${Date.now().toString(36)}`;
const OWNER = { email: `intl-owner-${RUN}@example.test`, password: "owner-passphrase-0123456789", secret: "" };
const SHOTS = process.env.INTL_SHOTS ? "docs/international-expansion/screenshots" : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 70 }); };
const consent = (ads = false) => ({ cookies: [{ name: "wc-consent", value: ads ? "v1.a0.d1" : "v1.a0.d0", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }], origins: [] });
const ctx = (browser: Browser, o: BrowserContextOptions = {}) => browser.newContext({ storageState: consent(), ...o });
let admin: Page;

test.afterAll(async () => {
  await sql(`delete from "CountryPolicy"`);
  await sql(`delete from "AdReport"`);
  await sql(`delete from "SystemSetting" where "key" in ('config.adsterra', 'config.adPolicy')`);
  await sql(`update "SystemSetting" set value = $1 where "key" = 'config.__version'`, [JSON.stringify({ v: `intl-reset-${RUN}` })]);
  await closeDb();
});

test("languages: prefixed URLs, translated chrome, html lang/dir, and /en redirects", async ({ browser, request }) => {
  const c = await ctx(browser);
  const page = await c.newPage();
  for (const [prefix, lang, dir, signIn] of [["es", "es", "ltr", "Iniciar sesión"], ["fr", "fr", "ltr", "Se connecter"], ["de", "de", "ltr", "Anmelden"], ["ja", "ja", "ltr", "ログイン"], ["zh-hans", "zh-Hans", "ltr", "登录"], ["ar", "ar", "rtl", "تسجيل الدخول"]] as const) {
    await page.goto(`${BASE}/${prefix}/apps`);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.getByRole("link", { name: signIn })).toBeVisible();
  }
  // The same route serves every language; links keep the prefix.
  await page.goto(`${BASE}/es/categories`);
  await expect(page.getByRole("heading", { level: 1, name: "Todas las categorías" })).toBeVisible();
  const href = await page.locator('main a[href*="/c/"]').first().getAttribute("href");
  expect(href).toMatch(/^\/es\/c\//);
  // Unknown language segments are ordinary (missing) pages; /en is never a second copy.
  const en = await request.get(`${BASE}/en/apps?x=1`, { maxRedirects: 0 });
  expect(en.status()).toBe(308);
  expect(en.headers().location).toBe(`${BASE}/apps?x=1`);
  const off = await request.get(`${BASE}/sw/apps`, { maxRedirects: 0 }); // Swahili is not switched on by default
  expect(off.status()).toBe(307);
  expect((await request.get(`${BASE}/es/api/version`, { maxRedirects: 0 })).status()).toBe(307);
  // English pages never redirect by browser language (crawlers and new visitors get what they asked for).
  const plain = await request.get(`${BASE}/apps`, { headers: { "accept-language": "es-ES,es;q=0.9" }, maxRedirects: 0 });
  expect(plain.status()).toBe(200);
  await c.close();
});

test("languages: the selector switches language, remembers it, and keeps the page", async ({ browser }) => {
  const c = await ctx(browser, { viewport: { width: 1280, height: 800 } });
  const page = await c.newPage();
  await page.goto(`${BASE}/apps`);
  await page.getByTestId("language-button").click();
  await page.getByRole("dialog").getByRole("button", { name: "Español" }).click();
  await page.waitForURL(`${BASE}/es/apps`);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  // The choice is remembered: an English URL now opens in Spanish.
  await page.goto(`${BASE}/categories`);
  await expect(page).toHaveURL(`${BASE}/es/categories`);
  // Client-side navigation keeps the language and the session.
  await page.locator('nav[aria-label="Principal"] a[href="/es/categories"]').click();
  await expect(page).toHaveURL(`${BASE}/es/categories`);
  // Switching back to English.
  await page.getByTestId("language-select").selectOption("en");
  await page.waitForURL(`${BASE}/categories`);
  await page.goto(`${BASE}/apps`);
  await expect(page).toHaveURL(`${BASE}/apps`);
  await c.close();
});

test("languages: a browser-language suggestion, never a redirect", async ({ browser }) => {
  const c = await ctx(browser, { locale: "fr-FR" });
  const page = await c.newPage();
  await page.goto(`${BASE}/`);
  await expect(page).toHaveURL(`${BASE}/`);
  const banner = page.getByTestId("language-suggest");
  await expect(banner).toContainText("Afficher Webcenta en Français ?");
  await banner.getByRole("button", { name: "Garder la langue actuelle" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("language-suggest")).toBeHidden();
  await c.close();
});

test("RTL: Arabic mirrors the layout without horizontal scrolling", async ({ browser }) => {
  for (const viewport of [{ width: 360, height: 800 }, { width: 1440, height: 900 }]) {
    const c = await ctx(browser, { viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await c.newPage();
    await page.goto(`${BASE}/ar`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (viewport.width >= 1024) {
      // The logo sits at the start of the line, which is the right-hand side in RTL.
      const logo = (await page.getByRole("link", { name: "الصفحة الرئيسية لـ Webcenta" }).boundingBox())!;
      expect(logo.x).toBeGreaterThan(viewport.width / 2);
    }
    await shot(page, `rtl-ar-${viewport.width}`);
    await c.close();
  }
});

test("one header and one tab bar on every page, in the browser and as an installed app", async ({ browser }) => {
  for (const standalone of [false, true]) {
    const c = await ctx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    if (standalone) {
      await c.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (q: string) => (q.includes("display-mode: standalone") ? ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList) : original(q));
      });
    }
    const page = await c.newPage();
    const counts = () => page.evaluate(() => ({ headers: document.querySelectorAll("body header.sticky").length, navs: document.querySelectorAll("nav[aria-label='Mobile']").length }));
    await page.goto(`${BASE}/`);
    expect(await counts()).toEqual({ headers: 1, navs: 1 });
    for (const name of ["Games", "Apps", "Search", "Home"]) {
      await page.locator("nav[aria-label='Mobile']").getByRole("link", { name }).click();
      await page.waitForLoadState("networkidle");
      expect(await counts(), `${name}${standalone ? " (installed)" : ""}`).toEqual({ headers: 1, navs: 1 });
    }
    await page.goBack();
    expect(await counts()).toEqual({ headers: 1, navs: 1 });
    // The tab bar stays at the bottom edge (above the home indicator) while scrolling.
    await page.evaluate(() => window.scrollTo(0, 2000));
    const nav = (await page.locator("nav[aria-label='Mobile']").boundingBox())!;
    expect(844 - (nav.y + nav.height)).toBeGreaterThanOrEqual(8);
    expect(844 - (nav.y + nav.height)).toBeLessThanOrEqual(40);
    await c.close();
  }
});

test("the install prompt sits above the tab bar, is dismissible and stays dismissed", async ({ browser }) => {
  const c = await ctx(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await c.newPage();
  await page.goto(`${BASE}/apps`);
  await page.waitForLoadState("networkidle");
  const fire = () => page.evaluate(() => { const e = new Event("beforeinstallprompt"); Object.assign(e, { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "dismissed" }) }); window.dispatchEvent(e); });
  const banner = page.getByTestId("install-banner");
  // Chromium fires the event once the app is installable; the listener is attached after hydration.
  await expect.poll(async () => { await fire(); return banner.isVisible(); }, { timeout: 10_000 }).toBe(true);
  const b = (await banner.boundingBox())!;
  const nav = (await page.locator("nav[aria-label='Mobile']").boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(nav.y); // never overlaps the navigation
  await shot(page, "install-prompt-375");
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await fire();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("install-banner")).toBeHidden();
  await c.close();
});

test("cards and rows: the whole preview is one link, with no extra View buttons", async ({ browser }) => {
  const c = await ctx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await c.newPage();
  await page.goto(`${BASE}/`);
  await expect(page.locator("main").getByText("View", { exact: true })).toHaveCount(0);
  const row = page.locator("main section li a[href^='/app/']").first();
  await expect(row).toBeVisible();
  // Nothing interactive inside a card link.
  expect(await row.locator("a, button").count()).toBe(0);
  await row.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/app\//);
  await expect(page.getByRole("link", { name: /Visit Official Website/i })).toHaveCount(1);
  await c.close();
});

test("SEO: reciprocal hreflang with x-default, and a multilingual sitemap that matches", async ({ request }) => {
  const html = await (await request.get(`${BASE}/es/apps`)).text();
  const links = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  expect(links).toContainEqual(["x-default", `${BASE}/apps`]);
  expect(links).toContainEqual(["es", `${BASE}/es/apps`]);
  expect(links).toContainEqual(["ar", `${BASE}/ar/apps`]);
  expect(html).toContain(`<link rel="canonical" href="${BASE}/es/apps"`);
  // Pages whose main text is not translated are only indexed in English.
  const about = await (await request.get(`${BASE}/es/about`)).text();
  expect(about).toMatch(/<meta name="robots" content="noindex, follow"/);
  const sitemap = await (await request.get(`${BASE}/sitemap.xml`)).text();
  expect(sitemap).toContain(`<loc>${BASE}/es/apps</loc>`);
  expect(sitemap).toContain(`hreflang="x-default"`);
  expect(sitemap).not.toContain(`${BASE}/es/about`);
  expect(sitemap).not.toMatch(/\/es\/(account|signin|api)/);
});

test("admin: country policies, ad reports and the translation dashboard", async ({ browser }) => {
  const a = await browser.newContext();
  admin = await a.newPage();
  await admin.goto(provisionAdmin(OWNER.email));
  OWNER.secret = (await admin.getByTestId("totp-secret").textContent())!.trim();
  await admin.getByLabel("Your name").fill("Ines International");
  await admin.getByLabel(/^Password/).fill(OWNER.password);
  await admin.getByLabel("Confirm password").fill(OWNER.password);
  await admin.getByLabel("Authenticator code").fill(totp(OWNER.secret));
  markTotpUsed(OWNER.secret);
  await admin.getByRole("button", { name: "Create account" }).click();
  await admin.waitForURL(/\/login\?invited=1/);
  await admin.getByLabel("Email").fill(OWNER.email);
  await admin.getByLabel("Password").fill(OWNER.password);
  await admin.getByRole("button", { name: "Continue" }).click();
  await admin.waitForURL(/\/login\/mfa/);
  await admin.getByLabel("Authentication code").fill(await freshTotp(OWNER.secret));
  await admin.getByRole("button", { name: "Verify" }).click();
  await admin.waitForURL(`${ADMIN}/`);

  await admin.goto(`${ADMIN}/languages`);
  await expect(admin.getByTestId("coverage-es")).toContainText("100%");
  await expect(admin.getByTestId("coverage-es")).toContainText("Unreviewed");
  await expect(admin.getByTestId("coverage-sw")).toContainText("0%");
  await expect(admin.getByTestId("hreflang-status")).toContainText("reciprocal");
  await shot(admin, "admin-languages");

  await admin.goto(`${ADMIN}/countries`);
  await admin.getByLabel("Country code").fill("ZZ");
  await admin.getByLabel("Restricted categories").fill("no-such-category");
  await admin.getByRole("button", { name: "Save policy" }).click();
  await expect(admin.getByText(/Unknown category slug/)).toBeVisible();
  await admin.getByLabel("Country code").fill("DE");
  await admin.getByLabel("Restricted categories").fill("games");
  await admin.getByLabel("No ads at all for visitors from this country").check();
  await admin.getByLabel(/I reviewed this policy today/).check();
  await admin.getByRole("button", { name: "Save policy" }).click();
  await expect(admin.getByText("Policy for DE saved.")).toBeVisible();
  await expect(admin.getByTestId("country-DE")).toContainText("games");
  await shot(admin, "admin-countries");
});

test("country rules: detected country hides categories and ads; a chosen country cannot undo it", async ({ browser, request }) => {
  // Ads on (pointing at a reserved non-existent host: no real impressions).
  await admin.goto(`${ADMIN}/settings/adsterra`);
  await admin.getByLabel("Enable Adsterra").check();
  await admin.getByLabel("Ad server host").fill("adsterra-test.invalid");
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();

  const visit = async (country: string | null) => {
    const c = await browser.newContext({ storageState: consent(true), viewport: { width: 1440, height: 900 }, extraHTTPHeaders: country ? { "cf-ipcountry": country } : {} });
    const page = await c.newPage();
    await page.goto(`${BASE}/c/games`);
    return { c, page };
  };
  const de = await visit("DE");
  await expect(de.page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(de.page.locator("main [data-ad-placement]")).toHaveCount(0);
  expect(await de.page.locator("main a[href^='/app/']").count()).toBe(0);
  await de.c.close();
  const us = await visit("US");
  await expect(us.page.locator("[data-ad-placement]").first()).toBeAttached();
  await us.c.close();
  // The frame endpoint follows the same rules.
  expect((await request.get(`${BASE}/ads/frame/300x250`, { headers: { "cf-ipcountry": "DE" } })).status()).toBe(404);
  expect((await request.get(`${BASE}/ads/frame/300x250`, { headers: { "cf-ipcountry": "US" } })).status()).toBe(200);
  // Unknown country with "No ads" chosen: nothing loads, and no country is invented.
  await sql(`delete from "SystemSetting" where "key" = 'config.adPolicy'`);
  await admin.goto(`${ADMIN}/settings/adPolicy`);
  await admin.getByLabel("Ads when the country is unknown").selectOption("deny");
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();
  expect((await request.get(`${BASE}/ads/frame/300x250`)).status()).toBe(404);
  expect((await request.get(`${BASE}/ads/frame/300x250`, { headers: { "cf-ipcountry": "US" } })).status()).toBe(200);
});

test("ad reports: visitors can report an ad; admins close the report", async ({ browser }) => {
  const c = await ctx(browser);
  const page = await c.newPage();
  await page.goto(`${BASE}/report-ad?placement=listing&provider=adsterra&from=%2Fapp%2Fsample-lumen-notes`);
  await page.getByLabel("Misleading, fake download button or fake warning").check();
  await page.getByLabel("Details (optional)").fill("A fake 'your phone is infected' warning.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText(/Thank you/)).toBeVisible();
  const [row] = await sql<{ placement: string; pagePath: string; country: string | null }>(`select placement, "pagePath", country from "AdReport" order by "createdAt" desc limit 1`);
  expect(row).toEqual({ placement: "listing", pagePath: "/app/sample-lumen-notes", country: null });
  await c.close();
  await admin.goto(`${ADMIN}/ad-reports`);
  await expect(admin.getByText("A fake 'your phone is infected' warning.")).toBeVisible();
  await admin.getByLabel("What was done").fill("Reported the advertiser to Adsterra support.");
  await admin.getByRole("button", { name: "Close" }).click();
  // Closed reports leave the open list.
  await expect(admin.getByText("A fake 'your phone is infected' warning.")).toBeHidden();
  await expect.poll(async () => (await sql<{ status: string }>(`select status from "AdReport" order by "createdAt" desc limit 1`))[0]!.status).toBe("resolved");
  await admin.goto(`${ADMIN}/ad-reports?status=closed`);
  await expect(admin.getByText("Reported the advertiser to Adsterra support.")).toBeVisible();
});
