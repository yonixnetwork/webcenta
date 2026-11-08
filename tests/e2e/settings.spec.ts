import { expect, test, type Page } from "@playwright/test";
import { ADMIN, BASE, closeDb, freshTotp, markTotpUsed, provisionAdmin, sql, totp } from "./helpers";

/** Admin → Settings against the standalone server (desktop project). */
test.describe.configure({ mode: "serial" });
const RUN = `cfg${Date.now().toString(36)}`;
const OWNER = { email: `owner-${RUN}@example.test`, password: "owner-passphrase-0123456789", secret: "" };
const SECRET = `smtp-pass-${RUN}-DoNotLeak`;
let page: Page;

test.afterAll(async () => {
  await sql(`delete from "SystemSetting" where "key" in ('config.general', 'config.email')`);
  await sql(`update "SystemSetting" set value = $1 where "key" = 'config.__version'`, [JSON.stringify({ v: `e2e-reset-${RUN}` })]);
  await closeDb();
});

test("first-time setup is not reachable without SETUP_TOKEN", async ({ request }) => {
  const res = await request.get("/setup", { headers: { host: "admin.localhost:3100" } });
  expect(res.status()).toBe(404);
});

test("owner signs in and sees every settings group with a status", async ({ browser }) => {
  page = await (await browser.newContext()).newPage();
  await page.goto(provisionAdmin(OWNER.email));
  OWNER.secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Your name").fill("Olive Owner");
  await page.getByLabel(/^Password/).fill(OWNER.password);
  await page.getByLabel("Confirm password").fill(OWNER.password);
  await page.getByLabel("Authenticator code").fill(totp(OWNER.secret));
  markTotpUsed(OWNER.secret);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/login\?invited=1/);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/login\/mfa/);
  await page.getByLabel("Authentication code").fill(await freshTotp(OWNER.secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(`${ADMIN}/`);

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  for (const g of ["Website", "Platform", "Email & notifications", "Security & sign-in", "Files", "URL scanning & security intelligence", "Analytics & advertising", "Payments"]) {
    await expect(page.getByRole("heading", { level: 2, name: g })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /Google sign-in/ }).getByText("Disabled")).toBeVisible();
  await expect(page.getByText("DATABASE_URL", { exact: true })).toBeVisible();
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/settings-index.png`, fullPage: true });
});

test("a saved banner appears on the public site without a restart", async () => {
  await page.goto(`${ADMIN}/settings/general`);
  await page.getByLabel("Site banner").fill(`Banner ${RUN}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved \(1 change\)/)).toBeVisible();
  const home = await page.request.get(`${BASE}/`);
  expect(await home.text()).toContain(`Banner ${RUN}`);
});

test("a saved secret is encrypted, masked, and never sent back to the browser", async () => {
  await page.goto(`${ADMIN}/settings/email`);
  await page.getByLabel("SMTP server").fill("smtp.example.test");
  await page.getByLabel("Username").fill("mailer@example.test");
  await page.getByLabel(/^Password/).fill(SECRET);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved \(/)).toBeVisible();
  await page.reload();
  expect(await page.content()).not.toContain(SECRET);
  await expect(page.getByText("••••••••", { exact: false }).first()).toBeVisible();
  await expect(page.getByLabel(/^Password/)).toHaveValue("");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/settings-email.png`, fullPage: true });

  const [row] = await sql<{ value: unknown }>(`select value from "SystemSetting" where "key" = 'config.email'`);
  expect(JSON.stringify(row!.value)).not.toContain(SECRET);
  const logs = await sql<{ metadata: unknown }>(`select metadata from "AuditLog" where action = 'settings.update'`);
  expect(logs.length).toBeGreaterThan(0);
  expect(JSON.stringify(logs)).not.toContain(SECRET);
  expect(JSON.stringify(logs)).not.toContain("smtp.example.test");
});

test("enabling a section with missing values is refused with an explanation", async () => {
  await page.goto(`${ADMIN}/settings/github`);
  await page.getByLabel("Enable GitHub sign-in").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/To enable GitHub sign-in, fill in: Client ID, Client secret/)).toBeVisible();
  await page.goto(`${BASE}/signin`);
  await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
});
