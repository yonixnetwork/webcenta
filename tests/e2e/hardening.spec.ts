import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN, BASE, closeDb, freshTotp, markTotpUsed, provisionAdmin, registerUser, setSite, sql, totp } from "./helpers";

/**
 * Final hardening: admin-only test push, step-up confirmation, security activity, bulk
 * moderation, search engine files, desktop account navigation. Screenshots with HARDENING_SHOTS=1.
 */
test.describe.configure({ mode: "serial" });
const RUN = `h${Date.now().toString(36)}`;
const OWNER = { email: `hard-owner-${RUN}@example.test`, password: "owner-passphrase-0123456789", secret: "" };
const USER = { email: `hard-user-${RUN}@example.test`, password: "" };
const SHOTS = process.env.HARDENING_SHOTS ? "docs/final-hardening/screenshots" : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 70, fullPage: (page.viewportSize()?.width ?? 0) >= 1024 }); };
let admin: Page;
let userSession: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

test.afterAll(async () => {
  await sql(`delete from "SystemSetting" where "key" in ('config.webmaster', 'config.imports')`);
  await sql(`update "SystemSetting" set value = $1 where "key" = 'config.__version'`, [JSON.stringify({ v: `hard-reset-${RUN}` })]);
  await sql(`delete from "PushSubscription"`);
  await sql(`delete from "AuthRateLimit" where "key" like '%sign-up%' or "key" like '%sign-in%'`);
  await closeDb();
});

test("users see no test-notification tool; the old endpoint is gone", async ({ browser, request }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  USER.password = await registerUser(page, USER.email, "Una User");
  userSession = await ctx.storageState();
  await page.goto(`${BASE}/account/notifications`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /test notification/i })).toHaveCount(0);
  await expect(page.getByText(/send a test/i)).toHaveCount(0);
  expect((await request.post(`${BASE}/api/push/test`, { data: { endpoint: "https://fcm.googleapis.com/fcm/send/x" } })).status()).toBe(404);
  // This user turns on notifications (two devices) so the admin test can target one of them.
  for (const n of ["phone", "laptop"]) {
    const r = await page.request.post(`${BASE}/api/push`, { data: { endpoint: `https://fcm.googleapis.com/fcm/send/${RUN}-${n}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }, headers: { "user-agent": n === "phone" ? "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" : "Mozilla/5.0 (Windows NT 10.0) Chrome/130" } });
    expect(r.status()).toBe(200);
  }
  await ctx.close();
});

test("admin test push goes to the one chosen device and reports the real result", async ({ browser }) => {
  admin = await (await browser.newContext()).newPage();
  await admin.goto(provisionAdmin(OWNER.email));
  OWNER.secret = (await admin.getByTestId("totp-secret").textContent())!.trim();
  await admin.getByLabel("Your name").fill("Hana Hardening");
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

  await admin.goto(`${ADMIN}/push`);
  await admin.getByLabel("Test recipient (account email)").fill(USER.email);
  await admin.getByRole("button", { name: "Find devices" }).click();
  const device = admin.getByLabel(/Device of Una User/);
  await expect(device.locator("option")).toHaveCount(2);
  await device.selectOption({ index: 0 });
  await admin.getByRole("button", { name: "Send test to this device" }).click();
  // A made-up subscription is never accepted by the real push service; the result says so honestly.
  await expect(admin.getByText(/Test not accepted|accepted by the push service/)).toBeVisible({ timeout: 30_000 });
  const tests = await sql<{ n: string }>(`select count(*) n from "PushDelivery" where kind = 'TEST'`);
  expect(Number(tests[0]!.n)).toBe(1); // exactly one device, never everyone
  expect(Number((await sql<{ n: string }>(`select count(*) n from "PushDelivery" where kind <> 'TEST' and "createdAt" > UTC_TIMESTAMP(3) - INTERVAL 2 MINUTE`))[0]!.n)).toBe(0);
  const [log] = await sql<{ metadata: string | Record<string, unknown> }>(`select metadata from "AuditLog" where action = 'push.test' order by "createdAt" desc limit 1`);
  const meta = typeof log!.metadata === "string" ? log!.metadata : JSON.stringify(log!.metadata);
  expect(meta).not.toContain("fcm.googleapis.com"); // no endpoint in the audit log
  expect(await admin.getByText(/test notification/i).count()).toBeGreaterThan(0);
  await shot(admin, "admin-test-push-1440");
});

test("sensitive admin actions need a fresh authenticator confirmation", async () => {
  await sql(`update "AdminSession" set "stepUpAt" = NULL`);
  await admin.goto(`${ADMIN}/admins`);
  await expect(admin.getByText(/Not confirmed in the last 10 minutes/)).toBeVisible();
  const invite = admin.locator("form", { has: admin.getByRole("button", { name: "Send invitation" }) });
  await invite.getByLabel("Email").fill(`second-${RUN}@example.test`);
  await invite.getByLabel("Role").selectOption("MODERATOR");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByText(/Confirm this action with a code from your authenticator app/)).toBeVisible();
  expect(Number((await sql<{ n: string }>(`select count(*) n from "AdminInvitation" where email = $1`, [`second-${RUN}@example.test`]))[0]!.n)).toBe(0);
  await invite.getByLabel("Authenticator code").fill("000000");
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByText(/wrong or was already used/)).toBeVisible();
  await invite.getByLabel("Authenticator code").fill(await freshTotp(OWNER.secret));
  await invite.getByRole("button", { name: "Send invitation" }).click();
  await expect(invite.getByText(/Invitation emailed/)).toBeVisible();
  await admin.reload();
  await expect(admin.getByText(/Confirmed for this session/)).toBeVisible();
  await shot(admin, "admin-step-up-1440");
});

test("security activity shows failed sign-ins, lockouts and sessions; headers are set", async ({ browser, request }) => {
  const other = await (await browser.newContext()).newPage();
  for (let i = 0; i < 3; i++) {
    await other.goto(`${ADMIN}/login`);
    await other.getByLabel("Email").fill(`nobody-${RUN}@example.test`);
    await other.getByLabel("Password").fill("wrong-password-123456");
    await other.getByRole("button", { name: "Continue" }).click();
    await expect(other.getByText("Incorrect email or password.")).toBeVisible();
  }
  await admin.goto(`${ADMIN}/security`);
  const act = admin.getByTestId("security-activity");
  await expect(act.getByText("Failed admin sign-ins")).toBeVisible();
  await expect(admin.getByRole("cell", { name: "Admin sign-in failures" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Active administrator sessions" })).toBeVisible();
  await expect(admin.getByRole("cell", { name: OWNER.email }).first()).toBeVisible();
  await shot(admin, "admin-security-activity-1440");
  const res = await request.get(`${BASE}/`);
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
});

test("bulk moderation on Submissions shows eligibility and never approves ineligible records", async () => {
  // Two real submissions: imported, then security-checked (fixture sites listed in tests/fixtures/certs.sh).
  for (const h of ["mod-a.localhost", "mod-b.localhost"]) await setSite(h, { mode: "app" });
  await admin.goto(`${ADMIN}/settings/imports`);
  await admin.getByLabel("Screenshots").selectOption("site");
  await admin.getByRole("button", { name: "Save" }).click();
  await admin.goto(`${ADMIN}/imports`);
  await admin.getByLabel("Website addresses").fill("https://mod-a.localhost\nhttps://mod-b.localhost");
  await admin.getByRole("combobox", { name: "Category", exact: true }).selectOption("productivity");
  await admin.getByRole("button", { name: "Add to queue" }).click();
  await expect(admin.getByText("2 added to the queue.")).toBeVisible();
  for (const h of ["mod-a.localhost", "mod-b.localhost"]) await admin.getByRole("checkbox", { name: `Select ${h}` }).check();
  await admin.getByRole("button", { name: "Import selected now" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Imported: 2/, { timeout: 60_000 });
  for (const h of ["mod-a.localhost", "mod-b.localhost"]) await admin.getByRole("checkbox", { name: `Select ${h}` }).check();
  await admin.getByRole("button", { name: "Run security checks" }).click();
  await expect(admin.getByTestId("bulk-result")).toHaveText(/Checked: 2/, { timeout: 60_000 });

  await admin.goto(`${ADMIN}/submissions`);
  await expect(admin.getByRole("columnheader", { name: "Bulk approval" })).toBeVisible();
  await expect(admin.getByRole("button", { name: /Approve all eligible/ })).toBeVisible();
  // Reject requires a reason (nothing changes without one).
  await admin.getByRole("button", { name: "Select visible" }).click();
  admin.once("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "Reject selected" }).click();
  await expect(admin.getByTestId("bulk-result")).toContainText(/Write a reason/);
  await admin.getByRole("button", { name: "Deselect all" }).click();
  const before = Number((await sql<{ n: string }>(`select count(*) n from "Listing" where status = 'PUBLISHED'`))[0]!.n);
  // Select everything visible and try to approve: only eligible ones may change, the rest are explained.
  admin.once("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "Select visible" }).click();
  const selected = Number(((await admin.getByTestId("selected-count").textContent()) ?? "0").split(" ")[0]);
  expect(selected).toBeGreaterThan(0);
  await admin.getByRole("button", { name: "Approve selected" }).click();
  await expect(admin.getByTestId("bulk-result")).toContainText(/Approved and published|Nothing changed/, { timeout: 30_000 });
  const text = (await admin.getByTestId("bulk-result").textContent()) ?? "";
  const after = Number((await sql<{ n: string }>(`select count(*) n from "Listing" where status = 'PUBLISHED'`))[0]!.n);
  const approved = Number(/Approved and published: (\d+)/.exec(text)?.[1] ?? "0");
  expect(after - before).toBe(approved);
  if (approved < selected) expect(text).toMatch(/Not changed \(\d+\)/);
  await shot(admin, "admin-submissions-bulk-1440");
});

test("search engines: sitemap, robots and verification files", async ({ request }) => {
  const sm = await request.get(`${BASE}/sitemap.xml`);
  expect(sm.status()).toBe(200);
  expect(sm.headers()["content-type"]).toContain("xml");
  const xml = await sm.text();
  expect(xml).toMatch(/^<\?xml/);
  expect(xml).toContain("<urlset");
  expect(xml).toContain(`${BASE}/apps`);
  // No private pages, other hosts, drafts or fixtures (public category names may contain "developer").
  expect(xml).not.toMatch(/<loc>[^<]*\/\/(admin|developers)\./);
  expect(xml).not.toMatch(/<loc>[^<]*localhost:\d+\/(account|signin|signup|forgot-password|reset-password|api|go|search|admin-host|developer-host)(\/|<)/);
  expect(xml).not.toMatch(/<loc>[^<]*\/app\/sample-/);
  const robots = await (await request.get(`${BASE}/robots.txt`)).text();
  expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  expect(robots).toMatch(/Allow: \//);
  expect(robots).not.toMatch(/Disallow: \/app\//);
  const adminRobots = await (await request.get(`${BASE}/robots.txt`, { headers: { host: new URL(ADMIN).host } })).text();
  expect(adminRobots).toMatch(/Disallow: \//);
  expect((await request.get(`${BASE}/login`, { headers: { host: new URL(ADMIN).host }, maxRedirects: 0 })).headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get(`${BASE}/google0123456789abcdef.html`)).status()).toBe(404);
  await admin.goto(`${ADMIN}/settings/webmaster`);
  await admin.getByLabel("Google HTML verification file name").fill("google0123456789abcdef.html");
  await admin.getByLabel("Bing XML file code").fill("ABCDEF0123456789ABCDEF0123456789");
  await admin.getByRole("button", { name: "Save" }).click();
  await expect(admin.getByText(/Saved \(/).first()).toBeVisible();
  const g = await request.get(`${BASE}/google0123456789abcdef.html`);
  expect(g.status()).toBe(200);
  expect(await g.text()).toBe("google-site-verification: google0123456789abcdef.html");
  expect((await request.get(`${BASE}/googleffffffffffffffff.html`)).status()).toBe(404);
  const b = await request.get(`${BASE}/BingSiteAuth.xml`);
  expect(b.status()).toBe(200);
  expect(await b.text()).toContain("<user>ABCDEF0123456789ABCDEF0123456789</user>");
});

test("an app page has unique metadata, canonical URL and honest structured data", async ({ page }) => {
  await page.goto(`${BASE}/app/sample-lumen-notes`);
  await expect(page).toHaveTitle(/Lumen Notes/);
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(`${BASE}/app/sample-lumen-notes`);
  expect(await page.locator('meta[name="description"]').getAttribute("content")).toMatch(/Lumen Notes|notes/i);
  expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toContain("Lumen Notes");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!) as Record<string, unknown>;
  expect(String(ld["@type"])).toMatch(/Application/);
  if (!("aggregateRating" in ld)) expect(JSON.stringify(ld)).not.toContain("ratingValue");
});

test("desktop account pages keep a visible way back to the marketplace", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: userSession });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/account/security`);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Home" })).toBeVisible();
  const back = page.getByRole("link", { name: "Back to marketplace" });
  await expect(back).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await shot(page, "account-desktop-1280");
  await back.click();
  await expect(page).toHaveURL(`${BASE}/`);
  await ctx.close();
  // Phones keep the list-and-screen layout (no desktop sidebar).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: userSession });
  const m = await phone.newPage();
  await m.goto(`${BASE}/account/security`);
  await expect(m.getByRole("link", { name: "Back to marketplace" })).toBeHidden();
  await expect(m.getByRole("link", { name: "Account" }).first()).toBeVisible();
  await phone.close();
});
