import { expect, test } from "@playwright/test";
import { BASE, registerUser, signOut, sql } from "./helpers";

/** Account drawer, tab bar, password visibility, sign-in destination and the notification centre. */
test.describe.configure({ mode: "serial" });
const RUN = `g${Date.now().toString(36)}`;
const U = { email: `growth-${RUN}@example.test`, password: "" };
// One signed-in session shared by the tests below (sign-ins are rate limited per address).
let session: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

test("sign-in goes to the homepage; the password can be shown and hidden", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  U.password = await registerUser(page, U.email, "Grace Growth");
  await expect(page).toHaveURL(`${BASE}/?welcome=1`);
  await signOut(page);
  await page.goto(`${BASE}/signin`);
  const pw = page.getByLabel("Password", { exact: true });
  await pw.fill(U.password);
  await expect(pw).toHaveAttribute("type", "password");
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(pw).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByLabel("Email").fill(U.email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`);
  // (A `next` the user asked for is still honoured: covered by signIn() in the journeys.)
  session = await ctx.storageState();
  await ctx.close();
});

test("the account drawer opens over the page without moving it, and closes with Escape", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: session });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const nav = page.getByRole("navigation", { name: "Mobile" });
  const before = await nav.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  await page.getByRole("button", { name: /Open account menu/ }).click();
  const drawer = page.getByRole("dialog", { name: "Grace Growth" });
  await expect(drawer).toBeVisible();
  for (const item of ["Profile & account settings", "Security", "Saved apps", "Collections", "My reviews", "Notifications", "Personalisation & privacy"]) {
    await expect(drawer.getByRole("link", { name: new RegExp(item) })).toBeVisible();
  }
  expect(await nav.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  // The tab bar stays fixed while the page scrolls.
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  expect((await nav.boundingBox())?.y).toBe(before?.y);
  await ctx.close();
});

test("the notification centre lists, marks read and deletes notifications; preferences save", async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: session })).newPage();
  await page.goto(`${BASE}/account/notifications`);
  const [u] = await sql<{ id: string }>(`select id from "User" where email = $1`, [U.email]);
  await sql(`insert into "Notification" (id, "userId", type, title, body, "linkPath", "createdAt") values (UUID(), $1, 'NEW_APP', 'New in Productivity: Test App', 'A new app', '/apps', UTC_TIMESTAMP(3)), (UUID(), $1, 'ANNOUNCEMENT', 'Hello from Webcenta', null, null, UTC_TIMESTAMP(3))`, [u!.id]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("2 unread");
  await page.getByRole("button", { name: "Mark “Hello from Webcenta” as read" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("1 unread");
  await page.getByRole("button", { name: "Delete “Hello from Webcenta”" }).click();
  await expect(page.getByText("Hello from Webcenta")).toHaveCount(0);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText("unread");
  await page.getByLabel("Reminders about new apps when you have not visited for a while").uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByText("Notification preferences saved.")).toBeVisible();
  const [prefs] = await sql<{ notifyReminders: number }>(`select "notifyReminders" from "User" where id = $1`, [u!.id]);
  expect(Number(prefs!.notifyReminders)).toBe(0);
});

test("Apps excludes games; policies and the sitemap are public; private pages are not indexable", async ({ page, request }) => {
  await page.goto(`${BASE}/apps`);
  await expect(page.getByRole("heading", { level: 1, name: "Apps" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "App categories" }).getByRole("link", { name: "Games" })).toHaveCount(0);
  for (const p of ["acceptable-use", "submissions", "verification", "reporting", "advertising"]) {
    const r = await request.get(`${BASE}/legal/${p}`);
    expect(r.status(), p).toBe(200);
  }
  const sitemap = await (await request.get(`${BASE}/sitemap.xml`)).text();
  expect(sitemap).toContain("/legal/acceptable-use");
  expect(sitemap).not.toMatch(/admin\.|\/account|\/signin|\/api\//);
  const robots = await (await request.get(`${BASE}/robots.txt`)).text();
  expect(robots).toMatch(/Disallow: \/account/);
  const admin = await request.get(`${BASE}/login`, { headers: { host: "admin.localhost:3100" } });
  expect(admin.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const app = await page.goto(`${BASE}/app/sample-lumen-notes`);
  expect(app?.headers()["x-robots-tag"]).toBeUndefined();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld["@type"]).toBe("WebApplication");
  expect(ld.mainEntityOfPage).toContain("/app/sample-lumen-notes");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/app\/sample-lumen-notes$/);
});
