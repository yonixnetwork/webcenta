import { expect, test, type Page } from "@playwright/test";
import { ADMIN, BASE, closeDb, freshTotp, markTotpUsed, provisionAdmin, setSite, sql, totp } from "./helpers";

/** Admin → Settings against the standalone server (desktop project). */
test.describe.configure({ mode: "serial" });
const RUN = `cfg${Date.now().toString(36)}`;
const OWNER = { email: `owner-${RUN}@example.test`, password: "owner-passphrase-0123456789", secret: "" };
const SECRET = `smtp-pass-${RUN}-DoNotLeak`;
let page: Page;

test.afterAll(async () => {
  await sql(`delete from "SystemSetting" where "key" in ('config.general', 'config.email', 'config.apple', 'config.imports')`);
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
  await expect(page.getByRole("heading", { level: 1, name: "System configuration" })).toBeVisible();
  for (const g of ["Application and website", "Database", "Authentication and sessions", "Google OAuth", "GitHub OAuth", "Email and SMTP", "Advertising", "Analytics", "File storage", "Security scanning", "Notifications", "External APIs", "Developer services", "Background jobs", "PWA", "System and deployment"]) {
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

test("OAuth sections show the exact callback URLs for both sites; paid integrations are hidden", async () => {
  await page.goto(`${ADMIN}/settings/google`);
  await expect(page.getByText("http://localhost:3100/api/auth/callback/google", { exact: true })).toBeVisible();
  await expect(page.getByText("http://developers.localhost:3100/api/auth/callback/google", { exact: true })).toBeVisible();
  // Apple (paid developer programme), Web Risk, VirusTotal, Plausible, Stripe and PayPal are switched off.
  for (const id of ["apple", "webrisk", "virustotal", "plausible", "stripe", "paypal"]) {
    expect((await page.goto(`${ADMIN}/settings/${id}`))?.status(), id).toBe(404);
  }
  await page.goto(`${BASE}/signin`);
  await expect(page.getByRole("button", { name: /Apple/ })).toHaveCount(0);
  await page.goto(`${ADMIN}/settings/system`);
  await expect(page.getByRole("heading", { level: 1, name: "Configuration inventory" })).toBeVisible();
  await expect(page.getByText("FIELD_ENCRYPTION_KEY", { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain(process.env.APP_FIELD_ENCRYPTION_KEY!);
});

test("an administrator imports a web app with its details, logo and screenshot", async () => {
  await setSite("importme.localhost", { mode: "app" });
  await page.goto(`${ADMIN}/settings/imports`);
  await page.getByLabel("Screenshots").selectOption("site");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.goto(`${ADMIN}/imports`);
  await page.getByLabel("Website addresses").fill("https://importme.localhost");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("productivity");
  await page.getByLabel(/Import a single address immediately/).check();
  await page.getByRole("button", { name: "Add to queue" }).click();
  await expect(page.getByText(/Imported\./)).toBeVisible({ timeout: 30_000 });
  const [rev] = await sql<{ data: string | Record<string, unknown> }>(`select r.data from "Listing" l join "ListingRevision" r on r."listingId" = l.id where l.domain = 'importme.localhost'`);
  const data = (typeof rev!.data === "string" ? JSON.parse(rev!.data) : rev!.data) as { name: string; description: string; privacyPolicyUrl?: string; logoAssetId?: string; screenshotAssetIds?: string[] };
  expect(data.name).toBe("importme App");
  expect(data.description).toContain("helps teams plan projects");
  expect(data.privacyPolicyUrl).toBe("https://importme.localhost/privacy");
  const ids = [data.logoAssetId, ...(data.screenshotAssetIds ?? [])].filter((x): x is string => Boolean(x));
  const media = await sql<{ id: string; kind: string }>(`select id, kind from "MediaAsset" where kind in ('LOGO', 'SCREENSHOT')`);
  expect(media.filter((m) => ids.includes(m.id)).map((m) => m.kind).sort()).toEqual(["LOGO", "SCREENSHOT"]);
  await expect(page.getByRole("link", { name: "Preview & review" }).first()).toBeVisible();
});

test("push notifications: the admin page explains the audience and refuses an empty audience", async () => {
  await sql(`delete from "PushSubscription"`);
  await page.goto(`${ADMIN}/push`);
  await expect(page.getByText(/0 devices subscribed/)).toBeVisible();
  await page.getByLabel("Title").fill("Hello from Webcenta");
  await page.getByLabel("Message").fill("New apps were added today.");
  await page.getByRole("button", { name: "Send to all subscribed devices" }).click();
  await expect(page.getByText("No browser has turned on notifications yet.")).toBeVisible();
  const key = await (await page.request.get(`${BASE}/api/push`)).json() as { publicKey: string };
  expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  // Only real push services are accepted.
  const bad = await page.request.post(`${BASE}/api/push`, { data: { endpoint: "https://evil.example/collect", keys: { p256dh: "x", auth: "y" } } });
  expect(bad.status()).toBe(400);
  const ok = await page.request.post(`${BASE}/api/push`, { data: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-test-endpoint", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } } });
  expect(ok.status()).toBe(200);
  await page.reload();
  await expect(page.getByText(/1 device subscribed \(0 signed in, 1 without an account\)/)).toBeVisible();
  await sql(`delete from "PushSubscription"`);
});

test("enabling a section with missing values is refused with an explanation", async () => {
  await page.goto(`${ADMIN}/settings/github`);
  await page.getByLabel("Enable GitHub sign-in").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/To enable GitHub sign-in, fill in: Client ID, Client secret/)).toBeVisible();
  await page.goto(`${BASE}/signin`);
  await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
});
