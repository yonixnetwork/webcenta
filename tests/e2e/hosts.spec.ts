import { expect, test } from "@playwright/test";
import { ADMIN, BASE, DEVHOST, closeDb, devSignIn, registerUser } from "./helpers";

/** The four hostnames, independent portals, and session isolation (desktop project). */
test.describe.configure({ mode: "serial" });
const RUN = `h${Date.now().toString(36)}`;
const U = { email: `hosts-${RUN}@example.test`, password: "" };

test.afterAll(async () => { await closeDb(); });

test("each hostname serves its own site, including direct URLs and refreshes", async ({ page, request }) => {
  // Public marketplace.
  await page.goto(`${BASE}/`);
  await expect(page.getByRole("link", { name: /Categories/ }).first()).toBeVisible();
  // www → the apex (308, path kept).
  const www = await request.get(`${BASE}/search?q=x`, { headers: { host: "www.localhost:3100" }, maxRedirects: 0 });
  expect(www.status()).toBe(308);
  expect(www.headers()["location"]).toMatch(/^(http:\/\/localhost:3100)?\/search\?q=x$/);
  // Admin portal: its own login, never the marketplace.
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await expect(page.getByText("Administrator accounts are separate")).toBeVisible();
  await expect(page.getByRole("link", { name: /Categories/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  // Developer portal: its own sign-in, never the marketplace or the admin portal.
  await page.goto(`${DEVHOST}/domains`);
  await expect(page).toHaveURL(/developers\.localhost:3100\/signin\?next=/);
  await expect(page.getByRole("heading", { name: "Developer sign in" })).toBeVisible();
  await expect(page.getByText("Developers", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Categories/ })).toHaveCount(0);
  await page.goto(`${DEVHOST}/signup`);
  await expect(page.getByRole("heading", { name: "Register as a developer" })).toBeVisible();
  // Internal folders are not reachable by path on any host.
  for (const host of ["localhost:3100", "admin.localhost:3100", "developers.localhost:3100"]) {
    expect((await request.get(`${BASE}/developer-host`, { headers: { host } })).status(), host).toBe(404);
  }
});

test("sessions are isolated: marketplace and developer portal have separate host-only cookies", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  U.password = await registerUser(page, U.email, "Host Tester");
  const pub = (await ctx.cookies(BASE)).find((c) => c.name.endsWith("wc.session_token"))!;
  expect(pub).toBeTruthy();
  expect(pub.domain).toBe("localhost"); // host-only: not sent to subdomains
  expect(pub.httpOnly).toBe(true);
  // The marketplace session does not sign you in to the developer portal.
  await page.goto(`${DEVHOST}/`);
  await expect(page).toHaveURL(/developers\.localhost:3100\/signin/);
  await devSignIn(page, U.email, U.password);
  const devCookie = (await ctx.cookies(DEVHOST)).find((c) => c.name.endsWith("wcdev.session_token"))!;
  expect(devCookie.domain).toBe("developers.localhost");
  expect(devCookie.httpOnly).toBe(true);
  await expect(page.getByRole("heading", { name: /Create your developer organisation/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Create your developer organisation/ })).toBeVisible();
  // Signing out of the developer portal leaves the marketplace session intact.
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(/developers\.localhost:3100\/(signin.*)?$/);
  await page.goto(`${DEVHOST}/analytics`);
  await expect(page).toHaveURL(/developers\.localhost:3100\/signin/);
  await page.goto(`${BASE}/account`);
  await expect(page).toHaveURL(`${BASE}/account`);
  // A developer-portal cookie is not accepted by the marketplace and vice versa.
  expect((await page.request.get(`${BASE}/account`, { headers: { cookie: `wcdev.session_token=${devCookie.value}` }, maxRedirects: 0 })).status()).toBe(307);
  await ctx.close();
});

test("OAuth callbacks reject forged or unconfigured requests safely", async ({ request }) => {
  for (const [host, origin] of [["localhost:3100", BASE], ["developers.localhost:3100", DEVHOST]] as const) {
    // A provider that is not configured cannot start a sign-in.
    const start = await request.post(`${BASE}/api/auth/sign-in/social`, { headers: { host, origin }, data: { provider: "google", callbackURL: "/" } });
    expect(start.status(), host).toBeGreaterThanOrEqual(400);
    expect(start.status(), host).toBeLessThan(500);
    // A callback with a forged state never creates a session.
    const cb = await request.get(`${BASE}/api/auth/callback/google?code=forged&state=forged`, { headers: { host }, maxRedirects: 0 });
    expect(cb.status(), host).toBeLessThan(500);
    expect(cb.headers()["set-cookie"] ?? "").not.toContain("session_token=");
  }
  // Cross-site sign-in POSTs are refused (CSRF / trusted origins).
  const evil = await request.post(`${BASE}/api/auth/sign-in/email`, { headers: { host: "developers.localhost:3100", origin: "https://evil.example" }, data: { email: U.email, password: U.password } });
  expect(evil.status()).toBe(403);
});
