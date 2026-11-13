import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN, BASE, CRON_SECRET, DEVHOST, closeDb, devSignIn, freshTotp, markTotpUsed, provisionAdmin, registerUser, setSite, sql, totp } from "./helpers";

/**
 * Production repair: the real scheduler entry point, import → checks → bulk publishing, push
 * delivery records, ad placements, the account screens on phones, filters, the Google button and
 * HTML-file domain verification. Screenshots go to docs/production-repair/screenshots when
 * REPAIR_SHOTS=1.
 */
test.describe.configure({ mode: "serial" });
const RUN = `r${Date.now().toString(36)}`;
const OWNER = { email: `repair-owner-${RUN}@example.test`, password: "owner-passphrase-0123456789", secret: "" };
const SHOTS = process.env.REPAIR_SHOTS ? "docs/production-repair/screenshots" : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// Phones: the visible screen (a full-page capture would draw the fixed tab bar mid-page). Larger screens: the whole page, as JPEG.
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 70, fullPage: wide && !name.startsWith("admin-imports") });
};
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
let admin: Page;
let userSession: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

test.afterAll(async () => {
  await sql(`delete from "SystemSetting" where "key" in ('config.adsterra', 'config.ads', 'config.google', 'config.imports', 'jobs.lock')`);
  // This file signs up extra accounts; give later suites their own sign-up allowance.
  await sql(`delete from "AuthRateLimit" where "key" like '%sign-up%'`);
  await sql(`update "SystemSetting" set value = $1 where "key" = 'config.__version'`, [JSON.stringify({ v: `repair-reset-${RUN}` })]);
  await sql(`delete from "PushSubscription"`);
  await closeDb();
});

async function adsContext(browser: Browser, viewport: { width: number; height: number }, mobile = false) {
  return browser.newContext({
    viewport, isMobile: mobile, hasTouch: mobile,
    storageState: { cookies: [{ name: "wc-consent", value: "v1.a0.d1", domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }], origins: [] },
  });
}

test("the Hostinger cron command runs the real scheduler; other callers are refused", async ({ request }) => {
  expect((await request.get(`${BASE}/api/cron/tick`)).status()).toBe(405);
  expect((await request.post(`${BASE}/api/cron/tick`)).status()).toBe(401);
  expect((await request.post(`${BASE}/api/cron/tick`, { headers: { authorization: "Bearer wrong-secret-wrong-secret-wrong-secret" } })).status()).toBe(401);
  // Exactly the command hPanel runs (the secret comes from the environment, never the command line).
  const out = execFileSync(process.execPath, [".next/standalone/cron-tick.mjs"], { env: { PATH: process.env.PATH, NODE_ENV: "production", PUBLIC_ORIGIN: BASE, CRON_SECRET }, encoding: "utf8", timeout: 120_000 });
  expect(out).toMatch(/webcenta cron: HTTP 200 run \S+: processed \d+, failed \d+, enqueued \d+/);
  const [run] = await sql<{ trigger: string; finishedAt: Date | null; skipped: number }>(`select "trigger", "finishedAt", skipped from "JobRun" order by "startedAt" desc limit 1`);
  expect(run).toMatchObject({ trigger: "cron" });
  expect(run!.finishedAt).not.toBeNull();
  // An overlapping invocation does nothing and says so.
  await sql(`update "SystemSetting" set value = $1 where "key" = 'jobs.lock'`, [JSON.stringify({ until: Date.now() + 60_000, runId: "held-by-test" })]);
  const overlap = execFileSync(process.execPath, [".next/standalone/cron-tick.mjs"], { env: { PATH: process.env.PATH, NODE_ENV: "production", PUBLIC_ORIGIN: BASE, CRON_SECRET }, encoding: "utf8" });
  expect(overlap).toMatch(/skipped: another run is in progress/);
  await sql(`update "SystemSetting" set value = $1 where "key" = 'jobs.lock'`, [JSON.stringify({ until: 0, runId: null })]);
});

test("Admin → Scheduler shows every job and Run now reports the real result", async ({ browser }) => {
  admin = await (await browser.newContext()).newPage();
  await admin.goto(provisionAdmin(OWNER.email));
  OWNER.secret = (await admin.getByTestId("totp-secret").textContent())!.trim();
  await admin.getByLabel("Your name").fill("Rita Repair");
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

  await admin.goto(`${ADMIN}/jobs`);
  await expect(admin.getByRole("heading", { level: 1, name: "Scheduler" })).toBeVisible();
  await expect(admin.getByTestId("scheduler-health")).toContainText("Last run by the hosting cron job");
  for (const label of ["Import web apps", "Duplicate detection", "Description enrichment", "Security re-checks", "Push announcements", "Inactivity reminders", "Analytics roll-up"]) {
    await expect(admin.locator("tr", { hasText: label }).first()).toBeVisible();
  }
  const row = admin.locator('tr[data-job="stats.rollup"]');
  await row.getByRole("button", { name: "Run now" }).click();
  await expect(row.getByText(/stats\.rollup finished in \d+ ms/)).toBeVisible({ timeout: 30_000 });
  const [job] = await sql<{ status: string }>(`select status from "Job" where type = 'stats.rollup' order by "createdAt" desc limit 1`);
  expect(job!.status).toBe("SUCCEEDED");
  await admin.reload();
  await expect(admin.locator('tr[data-job="stats.rollup"]').getByText("SUCCEEDED").first()).toBeVisible();
  await shot(admin, "admin-scheduler-1440");
});

test("import → security checks → bulk publish works on the selected rows, with clear results", async () => {
  // Fixed names: the fixture websites' test certificate lists them (tests/fixtures/certs.sh).
  const hosts = ["bulk-a.localhost", "bulk-b.localhost"];
  for (const h of hosts) await setSite(h, { mode: "app" });
  await admin.goto(`${ADMIN}/settings/imports`);
  await admin.getByLabel("Screenshots").selectOption("site");
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.goto(`${ADMIN}/imports`);
  await admin.getByLabel("Website addresses").fill(hosts.map((h) => `https://${h}`).join("\n"));
  await admin.getByRole("combobox", { name: "Category", exact: true }).selectOption("productivity");
  await admin.getByRole("button", { name: "Add to queue" }).click();
  await expect(admin.getByText("2 added to the queue.")).toBeVisible();
  // The same addresses again (one written differently) are recognised, not duplicated.
  await admin.getByLabel("Website addresses").fill(`https://${hosts[0]}\nhttps://www.${hosts[1]}/`);
  await admin.getByRole("button", { name: "Add to queue" }).click();
  await expect(admin.getByText(/Nothing added\.|already in the queue/)).toBeVisible();

  admin.on("dialog", (d) => void d.accept());
  const select = async () => { for (const h of hosts) await admin.getByRole("checkbox", { name: `Select ${h}` }).check(); };
  await select();
  await expect(admin.getByTestId("selected-count")).toHaveText("2 selected");
  await admin.getByRole("button", { name: "Deselect all" }).click();
  await expect(admin.getByTestId("selected-count")).toHaveText("0 selected");
  await expect(admin.getByRole("button", { name: "Publish selected" })).toBeDisabled();
  await select();
  await admin.getByRole("button", { name: "Import selected now" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Imported: 2/, { timeout: 60_000 });
  await shot(admin, "admin-imports-after-import-1440");
  await select();
  await admin.getByRole("button", { name: "Run security checks" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Checked: 2/, { timeout: 60_000 });
  await select();
  await admin.getByRole("button", { name: "Publish selected" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Published: 2/, { timeout: 30_000 });
  const rows = await sql<{ status: string; n: string }>(`select l.status, (select count(*) from "ListingStatusChange" c where c."listingId" = l.id and c."toStatus" = 'PUBLISHED') n from "Listing" l where l.domain in ($1, $2)`, hosts);
  expect(rows).toHaveLength(2);
  for (const r of rows) { expect(r.status).toBe("PUBLISHED"); expect(Number(r.n)).toBe(1); }
  // Publishing again changes nothing (idempotent).
  await select();
  await admin.getByRole("button", { name: "Publish selected" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Nothing changed/);
  await shot(admin, "admin-imports-published-1440");
  // A website that is down fails with its stage and category, and can be retried.
  const down = "bulk-down.localhost";
  await setSite(down, { mode: "down" });
  await admin.getByLabel("Website addresses").fill(`https://${down}`);
  await admin.getByLabel(/Import a single address immediately/).check();
  await admin.getByRole("button", { name: "Add to queue" }).click();
  await expect(admin.getByText(/Not imported \(job #[0-9a-f]{8}\), stage fetch/)).toBeVisible({ timeout: 60_000 });
});

test("push: delivery attempts are recorded honestly and the admin report explains them", async ({ request }) => {
  await sql(`delete from "PushSubscription"`);
  const endpoint = `https://fcm.googleapis.com/fcm/send/repair-${RUN}`;
  const ok = await request.post(`${BASE}/api/push`, { data: { endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" }, standalone: true }, headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile" } });
  expect(ok.status()).toBe(200);
  await admin.goto(`${ADMIN}/push`);
  await admin.getByLabel("Title").fill("Repair test announcement");
  await admin.getByLabel("Message").fill("Checking the delivery chain.");
  await admin.getByRole("button", { name: "Send to all subscribed devices" }).click();
  // A made-up subscription can never be accepted by the real push service: the result says so.
  await expect(admin.getByText(/Sent to 1 device: 0 accepted by push services, 1 failed so far\. Accepted does not prove a device displayed it\./)).toBeVisible({ timeout: 30_000 });
  const [d] = await sql<{ outcome: string; platform: string; kind: string }>(`select outcome, platform, kind from "PushDelivery" order by "createdAt" desc limit 1`);
  expect(d).toMatchObject({ platform: "android", kind: "CAMPAIGN" });
  expect(["FAILED", "EXPIRED"]).toContain(d!.outcome);
  await admin.reload();
  const report = admin.getByTestId("push-diagnostics");
  await expect(report.getByText("Push attempts")).toBeVisible();
  await expect(report.getByText("Accepted by push services")).toBeVisible();
  await shot(admin, "admin-push-diagnostics-1440");
  const tried = await request.post(`${BASE}/api/push/test`, { data: { endpoint } });
  expect((await tried.json()).ok).toBe(false);
});

test("ads: the six Adsterra units are served exactly, each in its own sandboxed frame", async ({ request }) => {
  await admin.goto(`${ADMIN}/settings/adsterra`);
  await admin.getByLabel("Enable Adsterra").check();
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();
  const frames: Array<[string, string]> = [
    ["native", '<script async="async" data-cfasync="false" src="https://bauval.org/21/2551bb0538e1d6f96d5844f91de7e70d"></script>\n<div id="container-2551bb0538e1d6f96d5844f91de7e70d"></div>'],
    ["468x60", "atOptions = {\n'key' : 'c48a5f48afbd920b94c779e34cbe26f8',\n'format' : 'iframe',\n'height' : 60,\n'width' : 468,\n'params' : {}\n};\n</script>\n<script src=\"https://bauval.org/22/c48a5f48afbd920b94c779e34cbe26f8\"></script>"],
    ["300x250", "atOptions = {\n'key' : '71f63cdca7866f4ff5d8f2c07764ccdd',\n'format' : 'iframe',\n'height' : 250,\n'width' : 300,\n'params' : {}\n};\n</script>\n<script src=\"https://bauval.org/22/71f63cdca7866f4ff5d8f2c07764ccdd\"></script>"],
    ["160x600", "atOptions = {\n'key' : '8f136dfb344bddf64040a81be40b2730',\n'format' : 'iframe',\n'height' : 600,\n'width' : 160,\n'params' : {}\n};\n</script>\n<script src=\"https://bauval.org/22/8f136dfb344bddf64040a81be40b2730\"></script>"],
    ["728x90", "atOptions = {\n'key' : 'f66f57ed50fa3f1c7686f5fda2f6b167',\n'format' : 'iframe',\n'height' : 90,\n'width' : 728,\n'params' : {}\n};\n</script>\n<script src=\"https://bauval.org/22/f66f57ed50fa3f1c7686f5fda2f6b167\"></script>"],
    ["320x50", "atOptions = {\n'key' : 'ce450a64b7d6fcc6866e4901d5e8153b',\n'format' : 'iframe',\n'height' : 50,\n'width' : 320,\n'params' : {}\n};\n</script>\n<script src=\"https://bauval.org/22/ce450a64b7d6fcc6866e4901d5e8153b\"></script>"],
  ];
  for (const [unit, code] of frames) {
    const r = await request.get(`${BASE}/ads/frame/${unit}`);
    expect(r.status(), unit).toBe(200);
    expect(await r.text()).toContain(code);
    expect(r.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(r.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  }
  expect((await request.get(`${BASE}/ads/frame/popunder`)).status()).toBe(404);
  expect((await request.get(`${BASE}/ads/frame/native`, { headers: { host: new URL(ADMIN).host } })).status()).toBe(404);
});

test("ads: placements load only where they fit, are labelled, and never on sign-in", async ({ browser }) => {
  // Browser tests point the ad server at a reserved, non-existent host: no real ad impressions from tests.
  await admin.goto(`${ADMIN}/settings/adsterra`);
  await admin.getByLabel("Ad server host").fill("adsterra-test.invalid");
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();

  const desk = await adsContext(browser, { width: 1440, height: 900 });
  const page = await desk.newPage();
  await page.goto(`${BASE}/`);
  const native = page.locator('[data-ad-placement="home-native"]');
  await native.scrollIntoViewIfNeeded();
  await expect(native.getByText("Advertisement")).toBeVisible();
  const frame = native.locator("iframe");
  await expect(frame).toHaveAttribute("src", "/ads/frame/native");
  const sandbox = (await frame.getAttribute("sandbox"))!;
  expect(sandbox).toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
  expect(sandbox).not.toContain("allow-top-navigation");
  await page.locator('[data-ad-placement="home-display"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-ad-placement="home-display"] iframe')).toHaveAttribute("src", "/ads/frame/300x250");
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await shot(page, "ads-home-1440");
  await page.goto(`${BASE}/search?q=notes`);
  await page.locator('[data-ad-placement="desktop-leaderboard"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-ad-placement="desktop-leaderboard"] iframe')).toHaveAttribute("src", "/ads/frame/728x90");
  await expect(page.locator('[data-ad-placement="mobile-compact"] iframe')).toHaveCount(0);
  await page.goto(`${BASE}/app/sample-lumen-notes`);
  await page.locator('[data-ad-placement="listing"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-ad-placement="listing"] iframe')).toHaveAttribute("src", "/ads/frame/300x250");
  await expect(page.locator('[data-ad-placement="desktop-sidebar"] iframe')).toHaveAttribute("src", "/ads/frame/160x600");
  await shot(page, "ads-app-1440");
  for (const p of ["/signin", "/signup"]) { await page.goto(`${BASE}${p}`); await expect(page.locator("[data-ad-placement]")).toHaveCount(0); }
  await desk.close();

  const phone = await adsContext(browser, { width: 390, height: 844 }, true);
  const m = await phone.newPage();
  await m.goto(`${BASE}/search?q=notes`);
  await m.locator('[data-ad-placement="mobile-compact"]').scrollIntoViewIfNeeded();
  await expect(m.locator('[data-ad-placement="mobile-compact"] iframe')).toHaveAttribute("src", "/ads/frame/320x50");
  // Wide units never load on a phone.
  await expect(m.locator('[data-ad-placement="desktop-leaderboard"] iframe')).toHaveCount(0);
  await expect(m.locator('[data-ad-placement="desktop-small"] iframe')).toHaveCount(0);
  expect(await overflow(m)).toBeLessThanOrEqual(1);
  // The tab bar stays above everything.
  const nav = await m.getByRole("navigation", { name: "Mobile" }).boundingBox();
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(844);
  await shot(m, "ads-search-390");
  await m.goto(`${BASE}/app/sample-lumen-notes`);
  await expect(m.locator('[data-ad-placement="desktop-sidebar"] iframe')).toHaveCount(0);
  expect(await overflow(m)).toBeLessThanOrEqual(1);
  await phone.close();

  // Without advertising consent there are no ads at all.
  const declined = await browser.newContext();
  const d = await declined.newPage();
  await d.goto(`${BASE}/`);
  await expect(d.locator("[data-ad-placement]")).toHaveCount(0);
  await declined.close();
});

test("account settings on a phone: one section per screen, view first, forms on request, no overflow", async ({ browser }) => {
  const reg = await browser.newContext();
  const p0 = await reg.newPage();
  await registerUser(p0, `repair-user-${RUN}@example.test`, "Ravi Repair");
  userSession = await reg.storageState();
  await reg.close();
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, storageState: userSession });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/account`);
    const list = page.getByRole("navigation", { name: "Account settings" });
    await expect(list).toBeVisible();
    await expect(page.getByLabel("Display name")).toHaveCount(0);
    if (width === 390) await shot(page, "account-home-390");
    await list.getByRole("link", { name: /^Profile/ }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByRole("link", { name: "Account" }).first()).toBeVisible(); // back link
    await expect(page.getByText("Ravi Repair").first()).toBeVisible();
    await expect(page.getByLabel("Display name")).toHaveCount(0); // no empty edit form by default
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByLabel("Display name")).toBeVisible();
    if (width === 390) await shot(page, "account-profile-edit-390");
    await page.goto(`${BASE}/account/security`);
    await expect(page.getByLabel("Current password")).toHaveCount(0);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByLabel("Current password")).toBeVisible();
    if (width === 390) await shot(page, "account-security-390");
    for (const path of ["/account", "/account/profile", "/account/security", "/account/favorites", "/account/collections", "/account/reviews", "/account/notifications", "/account/history", "/account/reports", "/account/privacy"]) {
      await page.goto(`${BASE}${path}`);
      await expect(page.locator("h1:visible").first()).toBeVisible();
      expect(await overflow(page), `${width}px ${path}`).toBeLessThanOrEqual(1);
      // The settings tab strip is gone on phones.
      await expect(page.getByRole("navigation", { name: "Account", exact: true })).toBeHidden();
    }
    await ctx.close();
  }
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: userSession });
  const dp = await desk.newPage();
  await dp.goto(`${BASE}/account/security`);
  await expect(dp.getByRole("navigation", { name: "Account", exact: true }).getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page");
  await shot(dp, "account-security-1280");
  await desk.close();
});

test("filters: a bottom sheet on phones and a compact panel on desktop", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/search?q=code`);
  await page.locator("summary", { hasText: "Filters" }).click();
  const panel = page.getByRole("group", { name: "Filters" });
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375.5);
  expect(box.y + box.height).toBeLessThanOrEqual(812.5); // a bottom sheet inside the screen
  await shot(page, "filters-sheet-375");
  await panel.getByLabel("Open source").check();
  await panel.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/openSource=1/);
  await expect(page.locator("summary", { hasText: "Filters" })).toContainText("1");
  await page.locator("summary", { hasText: "Filters" }).click();
  await expect(page.getByRole("group", { name: "Filters" }).getByRole("link", { name: /Reset/ })).toBeVisible();
  await ctx.close();
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await desk.newPage();
  await d.goto(`${BASE}/search?q=code`);
  const form = d.locator("form", { has: d.locator("summary", { hasText: "Filters" }) });
  await expect(form).toBeVisible();
  const bar = await form.boundingBox();
  expect(bar!.height).toBeLessThan(60); // one slim row when closed
  await d.locator("summary", { hasText: "Filters" }).click();
  expect((await d.getByRole("group", { name: "Filters" }).boundingBox())!.width).toBeLessThanOrEqual(600);
  await shot(d, "filters-panel-1440");
  await desk.close();
});

test("Google sign-in shows Google's G mark and keeps working markup", async ({ browser }) => {
  await admin.goto(`${ADMIN}/settings/google`);
  await admin.getByLabel("Enable Google sign-in").check();
  await admin.getByLabel("Client ID").fill("123456789012-abcdefghijklmnop.apps.googleusercontent.com");
  await admin.getByLabel(/^Client secret/).fill("GOCSPX-e2e-only-not-a-real-secret");
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();
  for (const vp of [{ width: 320, height: 640 }, { width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    for (const p of ["/signin", "/signup"]) {
      await page.goto(`${BASE}${p}`);
      const btn = page.getByRole("button", { name: "Continue with Google" });
      await expect(btn).toBeVisible();
      await expect(btn.locator("svg path")).toHaveCount(4);
      expect(await btn.evaluate((b) => getComputedStyle(b).backgroundColor)).toBe("rgb(255, 255, 255)");
      const b = (await btn.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
    await shot(page, `google-signup-${vp.width}`);
    await ctx.close();
  }  // Leave Google sign-in as it was (off) for the following suites.
  await admin.goto(`${ADMIN}/settings/google`);
  await admin.getByLabel("Enable Google sign-in").uncheck();
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();
});

test("HTML-file domain verification: exact file, address and server-side check", async ({ browser }) => {
  const ctx = await browser.newContext();
  const dev = await ctx.newPage();
  const email = `repair-dev-${RUN}@example.test`;
  const pw = await registerUser(dev, email, "Dana Dev");
  await devSignIn(dev, email, pw);
  await dev.getByLabel("Organisation or developer name").fill(`Repair Org ${RUN}`);
  await dev.getByRole("button", { name: "Create organisation" }).click();
  await expect(dev.getByRole("heading", { name: "Overview" })).toBeVisible();
  const host = "verify-site.localhost";
  await dev.goto(`${DEVHOST}/domains`);
  await dev.getByLabel("Domain").fill(host);
  await dev.getByLabel("Method").selectOption("HTML_FILE");
  await dev.getByRole("button", { name: "Get verification code" }).click();
  const card = dev.locator(`[data-domain="${host}"]`);
  await expect(card.getByText(/^webcenta-domain-verification-[0-9a-f]{16}\.html$/)).toBeVisible();
  await expect(card.getByRole("button", { name: /^Download webcenta-domain-verification-/ })).toBeVisible();
  await expect(card.getByText(new RegExp(`^https://${host.replace(/\./g, "\\.")}/webcenta-domain-verification-[0-9a-f]{16}\\.html$`))).toBeVisible();
  const content = (await card.getByTestId("challenge").textContent())!;
  const code = /webcenta-domain-verification: (wc-[A-Za-z0-9_-]+)/.exec(content)![1]!;
  await shot(dev, "developer-domain-html-file-1440");
  await card.getByRole("button", { name: "Check verification" }).click();
  await expect(card.getByRole("alert")).toContainText(/Could not load|does not contain/);
  await setSite(host, { verification: "wc-someone-elses-code" });
  await card.getByRole("button", { name: "Check verification" }).click();
  await expect(card.getByRole("alert")).toContainText(/does not contain this verification code/);
  await setSite(host, { verification: code });
  await card.getByRole("button", { name: "Check verification" }).click();
  await expect(dev.getByText(`${host} is verified.`)).toBeVisible();
  await ctx.close();
});
