import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN, BASE, DEVHOST, devSignIn, categoryId, closeDb, freshTotp, markTotpUsed, pngBuffer, provisionAdmin, registerUser, runCron, setSite, signIn, signOut, sql, totp } from "./helpers";

/**
 * The ten end-to-end user journeys, executed in order against the real app,
 * an isolated database, and local fixture websites. Every step uses the UI;
 * the database is only read (emails, ids) except where noted as test setup.
 */
test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const USER = { email: `user-${RUN}@example.test`, name: "Jamie Reviewer", password: "" };
const DEV = { email: `dev-${RUN}@example.test`, name: "Dana Developer", password: "", org: `Journey Labs ${RUN}` };
const ADMIN_USER = { email: `admin-${RUN}@example.test`, name: "Alex Admin", password: "a-very-long-admin-passphrase", secret: "" };
const APP = { name: `Journey Notes ${RUN}`, host: "journey-app.localhost", slug: "", id: "" };

let userPage: Page, devPage: Page, adminPage: Page;

async function newPage(browser: Browser, ua?: string) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, ...(ua ? { userAgent: ua } : {}) });
  return ctx.newPage();
}

async function adminLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(ADMIN_USER.email);
  await page.getByLabel("Password").fill(ADMIN_USER.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/login\/mfa/);
  await page.getByLabel("Authentication code").fill(await freshTotp(ADMIN_USER.secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(`${ADMIN}/`);
}

test.beforeAll(async ({ browser }) => {
  // Test setup: point one fictional listing at a local fixture website.
  await sql(`update "Listing" set "websiteUrl" = 'https://good-app.localhost/', domain = 'good-app.localhost' where slug = 'sample-skyline-weather'`);
  await setSite("good-app.localhost", { mode: "normal" });
  await setSite(APP.host, { mode: "normal", verification: "" });
  userPage = await newPage(browser);
  devPage = await newPage(browser);
  adminPage = await newPage(browser);
});

test.afterAll(async () => { await closeDb(); });

test("1. visitor discovers an app, opens its details and visits the official website", async ({ browser }) => {
  // A new visitor (unique browser identity) — repeat clicks by the same visitor within 30 min count once.
  const page = await newPage(browser, `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 e2e-${RUN}`);
  await page.goto(BASE);
  await page.getByRole("combobox").first().fill("skyline");
  await page.getByRole("option", { name: /Skyline Weather/ }).click();
  await page.waitForURL(/\/app\/sample-skyline-weather$/);
  await expect(page.getByRole("heading", { level: 1, name: "Skyline Weather" })).toBeVisible();
  await expect(page.getByText("Trust & safety")).toBeVisible();
  const before = Number((await sql<{ n: string }>(`select count(*) n from "ListingEvent" le join "Listing" l on l.id = le."listingId" where l.slug = 'sample-skyline-weather' and le.type = 'OUTBOUND_CLICK'`))[0]!.n);
  await page.getByRole("link", { name: /Visit website/ }).click();
  await expect(page.getByRole("heading", { name: "You’re leaving Webcenta" })).toBeVisible();
  await page.getByRole("button", { name: /Continue to good-app.localhost/ }).click();
  await page.waitForURL("https://good-app.localhost/");
  await expect(page.getByRole("heading", { name: "good-app" })).toBeVisible();
  const after = Number((await sql<{ n: string }>(`select count(*) n from "ListingEvent" le join "Listing" l on l.id = le."listingId" where l.slug = 'sample-skyline-weather' and le.type = 'OUTBOUND_CLICK'`))[0]!.n);
  expect(after).toBe(before + 1);
  await page.context().close();
});

test("2. a user registers, logs in, saves an application and writes a review", async () => {
  USER.password = await registerUser(userPage, USER.email, USER.name);
  // Log out and back in to exercise the full sign-in flow.
  await signOut(userPage);
  await signIn(userPage, USER.email, USER.password);
  await userPage.goto(`${BASE}/app/sample-skyline-weather`);
  await userPage.getByRole("button", { name: "Save" }).click();
  await expect(userPage.getByRole("button", { name: "Saved" })).toBeVisible();
  await userPage.getByLabel("4 stars").check({ force: true });
  await userPage.getByLabel("Title (optional)").fill("Reliable forecasts");
  await userPage.getByLabel("Review (optional)").fill("Clear hourly forecasts and the radar loads quickly on my phone.");
  await userPage.getByRole("button", { name: "Publish review" }).click();
  // New accounts' reviews are held for moderation (anti-spam), not silently published.
  await expect(userPage.getByText(/will appear after a quick moderation check/)).toBeVisible();
  await userPage.goto(`${BASE}/account/favorites`);
  await expect(userPage.getByRole("link", { name: /Skyline Weather/ })).toBeVisible();
});

test("3. a developer registers, verifies their domain, submits an application and tracks it", async () => {
  DEV.password = await registerUser(devPage, DEV.email, DEV.name);
  // The developer portal is its own site with its own session: sign in there.
  await devSignIn(devPage, DEV.email, DEV.password);
  await devPage.getByLabel("Organisation or developer name").fill(DEV.org);
  await devPage.getByRole("button", { name: "Create organisation" }).click();
  await expect(devPage.getByRole("heading", { name: "Overview" })).toBeVisible();

  await devPage.goto(`${DEVHOST}/domains`);
  await devPage.getByLabel("Domain").fill(APP.host);
  await devPage.getByLabel("Method").selectOption("WELL_KNOWN_FILE");
  await devPage.getByRole("button", { name: "Get verification code" }).click();
  const code = (await devPage.getByTestId("challenge").first().textContent())!.trim();
  // Before publishing the proof, verification must fail.
  await devPage.getByRole("button", { name: "Check now" }).click();
  await expect(devPage.getByRole("alert").filter({ hasText: /Could not load|does not contain/ })).toBeVisible();
  await setSite(APP.host, { verification: code });
  await devPage.getByRole("button", { name: "Check now" }).click();
  await expect(devPage.getByText(`${APP.host} is verified.`)).toBeVisible();

  await devPage.goto(`${DEVHOST}/listings/new`);
  await devPage.getByLabel("App name").fill(APP.name);
  await devPage.getByLabel("Tagline").fill("Linked notes for teams");
  await devPage.getByLabel("Official website (https://)").fill(`https://${APP.host}/`);
  await devPage.getByLabel("Description").fill("Journey Notes is a collaborative notes app with backlinks, shared workspaces and offline support.");
  await devPage.getByLabel("Key features").fill("Backlinks\nShared workspaces\nOffline mode");
  await devPage.getByLabel("Primary category").selectOption(await categoryId("productivity-notes"));
  await devPage.getByLabel("Privacy policy URL").fill(`https://${APP.host}/privacy`);
  await devPage.getByLabel("Terms URL").fill(`https://${APP.host}/terms`);
  await devPage.getByTestId("upload-logoAssetId").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await pngBuffer(256) });
  await expect(devPage.locator('input[name="logoAssetId"]')).toHaveCount(1);
  await devPage.getByRole("button", { name: "Save draft" }).click();
  await devPage.waitForURL(/developers\.localhost:\d+\/listings\/[^/]+\?saved=1/);
  APP.id = devPage.url().split("/listings/")[1]!.split("?")[0]!;
  await devPage.getByRole("button", { name: "Submit for review" }).click();
  await expect(devPage.getByText(/Revision #1 was submitted .* and is being reviewed/)).toBeVisible();
  // Track: automated checks finish and the listing waits for a moderator (never auto-published here).
  await expect.poll(async () => (await sql<{ status: string }>(`select status from "Listing" where id = $1`, [APP.id]))[0]!.status, { timeout: 30_000 }).toBe("UNDER_REVIEW");
  await devPage.reload();
  await expect(devPage.getByText("under review").first()).toBeVisible();
  await expect(devPage.getByText(/Latest automated checks/)).toBeVisible();
  APP.slug = (await sql<{ slug: string }>(`select slug from "Listing" where id = $1`, [APP.id]))[0]!.slug;
  // Not public before approval.
  expect((await devPage.request.get(`${BASE}/app/${APP.slug}`)).status()).toBe(404);
});

test("4. an administrator logs in, reviews the submission, approves and publishes it", async () => {
  const invite = provisionAdmin(ADMIN_USER.email);
  await adminPage.goto(invite);
  ADMIN_USER.secret = (await adminPage.getByTestId("totp-secret").textContent())!.trim();
  await adminPage.getByLabel("Your name").fill(ADMIN_USER.name);
  await adminPage.getByLabel(/^Password/).fill(ADMIN_USER.password);
  await adminPage.getByLabel("Confirm password").fill(ADMIN_USER.password);
  await adminPage.getByLabel("Authenticator code").fill(totp(ADMIN_USER.secret));
  markTotpUsed(ADMIN_USER.secret);
  await adminPage.getByRole("button", { name: "Create account" }).click();
  await adminPage.waitForURL(/\/login\?invited=1/);
  await adminLogin(adminPage);
  await expect(adminPage.getByRole("heading", { name: "Overview" })).toBeVisible();

  await adminPage.getByRole("link", { name: /^Submissions/ }).click();
  await adminPage.getByRole("link", { name: APP.name }).click();
  await expect(adminPage.getByText("Automated checks")).toBeVisible();
  await expect(adminPage.getByText(/Developer has verified ownership/)).toBeVisible();
  await adminPage.getByRole("button", { name: "Approve & publish" }).click();
  await expect(adminPage.getByText(/Decided .* by Alex Admin: approved/)).toBeVisible();

  // Visible in its category, in search and on its page.
  const pub = await newPage(adminPage.context().browser()!);
  await pub.goto(`${BASE}/c/productivity-notes`);
  await expect(pub.getByRole("link", { name: new RegExp(APP.name) })).toBeVisible();
  await pub.goto(`${BASE}/search?q=${encodeURIComponent("Journey Notes")}`);
  await expect(pub.getByRole("link", { name: new RegExp(APP.name) })).toBeVisible();
  await pub.goto(`${BASE}/app/${APP.slug}`);
  await expect(pub.getByRole("heading", { level: 1, name: APP.name })).toBeVisible();
  await expect(pub.getByText("Domain verified")).toBeVisible();
  await pub.context().close();

  // The developer was notified.
  await devPage.goto(`${BASE}/account/notifications`);
  await expect(devPage.getByText(`${APP.name} is now published`)).toBeVisible();

  // Moderate the held review from journey 2.
  await adminPage.goto(`${ADMIN}/reviews`);
  const held = adminPage.locator("li", { hasText: USER.email }).filter({ hasText: "Clear hourly forecasts" });
  await expect(held).toBeVisible();
  await held.getByRole("button", { name: "Apply" }).click();
  await expect(held).toHaveCount(0); // leaves the moderation queue
  expect((await sql<{ status: string }>(`select r.status from "Review" r join "User" u on u.id = r."userId" where u.email = $1 order by r."createdAt" desc limit 1`, [USER.email]))[0]!.status).toBe("PUBLISHED");
});

test("9. a developer replies to a review and the user receives a notification", async () => {
  await userPage.goto(`${BASE}/app/${APP.slug}`);
  await userPage.getByLabel("5 stars").check({ force: true });
  await userPage.getByLabel("Review (optional)").fill("Backlinks work great and the offline mode saved me on a train.");
  await userPage.getByRole("button", { name: "Publish review" }).click();
  await expect(userPage.getByText(/moderation check|published/)).toBeVisible();
  await adminPage.goto(`${ADMIN}/reviews`);
  const held = adminPage.locator("li", { hasText: USER.email }).filter({ hasText: "offline mode saved me" });
  await held.getByRole("button", { name: "Apply" }).click();
  await expect(held).toHaveCount(0); // leaves the moderation queue
  expect((await sql<{ status: string }>(`select r.status from "Review" r join "User" u on u.id = r."userId" where u.email = $1 order by r."createdAt" desc limit 1`, [USER.email]))[0]!.status).toBe("PUBLISHED");

  await devPage.goto(`${DEVHOST}/reviews`);
  await devPage.locator("li", { hasText: "offline mode saved me" }).getByRole("button", { name: "Reply as developer" }).click();
  await devPage.getByLabel("Developer reply").fill("Thank you! Offline sync was a big focus for us.");
  await devPage.getByRole("button", { name: "Publish reply" }).click();
  await expect(devPage.getByText(/Reply published/)).toBeVisible();

  await userPage.goto(`${BASE}/`);
  await expect(userPage.getByRole("link", { name: /Notifications \(\d+ unread\)/ })).toBeVisible();
  await userPage.goto(`${BASE}/account/notifications`);
  await expect(userPage.getByText(`${DEV.org} replied to your review`)).toBeVisible();
  await userPage.goto(`${BASE}/app/${APP.slug}`);
  await expect(userPage.getByText(`Response from ${DEV.org}`)).toBeVisible();
  const email = await sql(`select 1 from "EmailMessage" where "to" = $1 and template = 'notification:REVIEW_REPLY'`, [USER.email]);
  expect(email.length).toBe(1);
});

test("5. a developer views analytics after users visit and click their application", async ({ browser }) => {
  const visitors = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  ];
  for (const ua of visitors) {
    const p = await newPage(browser, ua);
    const first = p.waitForResponse((r) => r.url().includes("/api/events/view"));
    await p.goto(`${BASE}/app/${APP.slug}`);
    expect((await first).ok()).toBe(true);
    const second = p.waitForResponse((r) => r.url().includes("/api/events/view"));
    await p.reload(); // duplicate view within 30 min: must not be counted twice
    expect((await second).ok()).toBe(true);
    await p.getByRole("link", { name: /Visit website/ }).click();
    await p.getByRole("button", { name: /Continue to/ }).click();
    await p.waitForURL(`https://${APP.host}/`);
    await p.context().close();
  }
  // A crawler is never counted.
  const bot = await newPage(browser, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
  const botView = bot.waitForResponse((r) => r.url().includes("/api/events/view"));
  await bot.goto(`${BASE}/app/${APP.slug}`);
  expect((await botView).ok()).toBe(true);
  await bot.context().close();

  const events = await sql<{ type: string; n: string }>(`select type, count(*) n from "ListingEvent" where "listingId" = $1 group by type`, [APP.id]);
  const count = (t: string) => Number(events.find((e) => e.type === t)?.n ?? 0);
  expect(count("VIEW")).toBe(3 + 1); // 3 visitors (+1 from journey 9's reviewer page view); reloads and the bot excluded
  expect(count("OUTBOUND_CLICK")).toBe(3);

  await runCron(devPage.request, ["stats.rollup"]);
  await devPage.goto(`${DEVHOST}/listings/${APP.id}/analytics`);
  const stat = (label: string) => devPage.locator(`[data-stat="${label}"] p.text-2xl`);
  await expect(stat("Listing views")).toHaveText("4");
  await expect(stat("Outbound clicks")).toHaveText("3");
  await expect(devPage.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(devPage.getByText(/cannot see what happens on your website/)).toBeVisible();
  // Admin platform analytics includes the same traffic.
  await adminPage.goto(`${ADMIN}/analytics`);
  await expect(adminPage.getByRole("heading", { name: "Platform analytics" })).toBeVisible();
  await expect(adminPage.getByText(APP.name).first()).toBeVisible();
});

test("6. a user reports a suspicious application and an administrator investigates it", async () => {
  await userPage.goto(`${BASE}/app/${APP.slug}`);
  await userPage.getByRole("button", { name: "Report listing" }).click();
  await userPage.getByLabel("Phishing or credential theft").check();
  await userPage.getByLabel("Details (optional)").fill("The login page looked unusual to me.");
  await userPage.getByRole("button", { name: "Send report" }).click();
  await expect(userPage.getByRole("status").filter({ hasText: "received" })).toBeVisible();

  await adminPage.goto(`${ADMIN}/reports`);
  const card = adminPage.locator("li", { hasText: "The login page looked unusual" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Run security scan" }).click();
  await expect(card.getByText(/Scan complete: PASS/)).toBeVisible({ timeout: 30_000 });
  await card.getByLabel("Status").selectOption("RESOLVED_NO_ACTION");
  await card.getByLabel("Notes").fill("Scan clean; login page belongs to the verified developer.");
  await card.getByRole("button", { name: "Update report" }).click();
  await expect(card).toHaveCount(0); // leaves the open-reports queue
  expect((await sql<{ status: string }>(`select status from "Report" where details = 'The login page looked unusual to me.' order by "createdAt" desc limit 1`))[0]!.status).toBe("RESOLVED_NO_ACTION");
  await userPage.goto(`${BASE}/account/notifications`);
  await expect(userPage.getByText("Your report has been reviewed")).toBeVisible();
  await userPage.goto(`${BASE}/account/reports`);
  await expect(userPage.getByText(/resolved no action/)).toBeVisible();
});

test("7. a scheduled security check detects a problem and triggers the correct response", async () => {
  // The site turns malicious after approval.
  await setSite(APP.host, { mode: "phishing" });
  await sql(`update "Listing" set "nextScanAt" = UTC_TIMESTAMP(3) - INTERVAL 1 MINUTE where id = $1`, [APP.id]);
  await runCron(adminPage.request, ["monitor.enqueue"]);
  await expect.poll(async () => (await sql<{ s: string }>(`select "securityStatus" s from "Listing" where id = $1`, [APP.id]))[0]!.s, { timeout: 30_000 }).toBe("UNDER_INVESTIGATION");
  const alerts = await sql<{ severity: string; title: string }>(`select severity, title from "SecurityAlert" where "listingId" = $1 and status = 'OPEN'`, [APP.id]);
  expect(alerts.some((a) => a.severity === "HIGH" && /seed\/recovery phrase/.test(a.title))).toBe(true);
  // Public page shows the warning; admins and the developer are notified.
  const pub = await newPage(adminPage.context().browser()!);
  await pub.goto(`${BASE}/app/${APP.slug}`);
  await expect(pub.getByRole("alert").filter({ hasText: "Under investigation" })).toBeVisible();
  await pub.context().close();
  expect((await sql(`select 1 from "EmailMessage" where "to" = $1 and template = 'admin-alert'`, [ADMIN_USER.email])).length).toBeGreaterThan(0);
  await devPage.goto(`${BASE}/account/notifications`);
  await expect(devPage.getByText(`Security review of ${APP.name}`)).toBeVisible();

  // Threat intelligence confirms it (admin adds the domain to the blocklist) → CRITICAL → automatic restriction.
  await adminPage.goto(`${ADMIN}/security`);
  await adminPage.getByLabel(/Known-bad domains/).fill(APP.host);
  await adminPage.getByRole("button", { name: "Save blocklist" }).click();
  await expect(adminPage.getByText("1 domain(s) on the blocklist.")).toBeVisible();
  await adminPage.goto(`${ADMIN}/listings/${APP.id}`);
  await adminPage.getByRole("button", { name: "Run security scan now" }).click();
  await expect(adminPage.getByText(/Scan complete: FAIL/)).toBeVisible({ timeout: 30_000 });
  expect((await sql<{ s: string }>(`select "securityStatus" s from "Listing" where id = $1`, [APP.id]))[0]!.s).toBe("RESTRICTED");
  expect((await adminPage.request.get(`${BASE}/app/${APP.slug}`)).status()).toBe(404);
});

test("8. an administrator suspends a malicious listing and it disappears from public discovery", async ({ browser }) => {
  await adminPage.goto(`${ADMIN}/security/alerts?listing=${APP.id}`);
  const links = adminPage.getByRole("link", { name: APP.name });
  await links.first().click();
  // Act on the listing first, then close the alert with the findings.
  await adminPage.getByRole("button", { name: "Suspend listing" }).click();
  await expect(adminPage.getByText("Listing suspended.")).toBeVisible();
  const alertId = adminPage.url().split("/security/alerts/")[1]!;
  await adminPage.getByLabel("Outcome").selectOption("RESOLVED_ACTION_TAKEN");
  await adminPage.getByLabel(/Findings/).fill("Confirmed seed-phrase phishing page; listing suspended.");
  await adminPage.getByRole("button", { name: "Record outcome" }).click();
  await expect(adminPage.getByText("Confirmed seed-phrase phishing page", { exact: false }).first()).toBeVisible();
  expect((await sql<{ status: string }>(`select status from "SecurityAlert" where id = $1`, [alertId]))[0]!.status).toBe("RESOLVED_ACTION_TAKEN");
  expect((await sql<{ status: string }>(`select status from "Listing" where id = $1`, [APP.id]))[0]!.status).toBe("SUSPENDED");

  const pub = await newPage(browser);
  for (const path of [`/app/${APP.slug}`, `/go/${APP.slug}`, `/app/${APP.slug}/alternatives`]) expect((await pub.request.get(`${BASE}${path}`)).status(), path).toBe(404);
  await pub.goto(`${BASE}/search?q=${encodeURIComponent("Journey Notes")}`);
  await expect(pub.getByRole("link", { name: new RegExp(APP.name) })).toHaveCount(0);
  await pub.goto(`${BASE}/c/productivity-notes`);
  await expect(pub.getByRole("link", { name: new RegExp(APP.name) })).toHaveCount(0);
  expect(await (await pub.request.get(`${BASE}/sitemap.xml`)).text()).not.toContain(APP.slug);
  const suggest = await (await pub.request.get(`${BASE}/api/search/suggest?q=journey`)).json();
  expect(JSON.stringify(suggest)).not.toContain(APP.slug);
  expect((await pub.request.post(`${BASE}/go/${APP.slug}/continue`, { maxRedirects: 0 })).status()).toBe(404);
  await pub.context().close();
  // The user's favourites/recommendations no longer surface it either.
  await userPage.goto(`${BASE}/`);
  await expect(userPage.getByRole("link", { name: new RegExp(APP.name) })).toHaveCount(0);

  // Recovery: the developer fixes the site, the admin clears the finding and reinstates the listing.
  await setSite(APP.host, { mode: "normal" });
  await adminPage.goto(`${ADMIN}/security`);
  await adminPage.getByLabel(/Known-bad domains/).fill("");
  await adminPage.getByRole("button", { name: "Save blocklist" }).click();
  await expect(adminPage.getByText("0 domain(s) on the blocklist.")).toBeVisible();
  for (const a of await sql<{ id: string }>(`select id from "SecurityAlert" where "listingId" = $1 and status in ('OPEN','INVESTIGATING')`, [APP.id])) {
    await adminPage.goto(`${ADMIN}/security/alerts/${a.id}`);
    await adminPage.getByLabel("Outcome").selectOption("RESOLVED_NO_ACTION");
    await adminPage.getByLabel(/Findings/).fill("Site cleaned by developer; verified by re-scan.");
    await adminPage.getByRole("button", { name: "Record outcome" }).click();
    await expect.poll(async () => (await sql<{ status: string }>(`select status from "SecurityAlert" where id = $1`, [a.id]))[0]!.status).toBe("RESOLVED_NO_ACTION");
  }
  await adminPage.goto(`${ADMIN}/listings/${APP.id}`);
  await adminPage.getByLabel("Reason / findings").fill("Developer removed the malicious page; re-scan clean.");
  await adminPage.getByRole("button", { name: "Reinstate (publish again)" }).click();
  await expect(adminPage.getByRole("button", { name: "Suspend (hide from discovery)" })).toBeVisible();
  expect((await sql<{ status: string }>(`select status from "Listing" where id = $1`, [APP.id]))[0]!.status).toBe("PUBLISHED");
  await adminPage.getByRole("button", { name: "Run security scan now" }).click();
  // The site's identity changed back from the phishing page, which monitoring flags (MEDIUM) for review.
  await expect(adminPage.getByText(/Scan complete: WARN. 1 finding/)).toBeVisible({ timeout: 30_000 });
  expect((await sql<{ s: string }>(`select "securityStatus" s from "Listing" where id = $1`, [APP.id]))[0]!.s).toBe("WARNING");
  const [change] = await sql<{ id: string; title: string }>(`select id, title from "SecurityAlert" where "listingId" = $1 and status = 'OPEN'`, [APP.id]);
  expect(change!.title).toMatch(/identity change/);
  await adminPage.goto(`${ADMIN}/security/alerts/${change!.id}`);
  await adminPage.getByLabel("Outcome").selectOption("RESOLVED_NO_ACTION");
  await adminPage.getByLabel(/Findings/).fill("Expected: legitimate content restored after cleanup.");
  await adminPage.getByRole("button", { name: "Record outcome" }).click();
  await expect.poll(async () => (await sql<{ s: string; status: string }>(`select "securityStatus" s, status from "Listing" where id = $1`, [APP.id]))[0]).toEqual({ s: "PASSED", status: "PUBLISHED" });
  expect((await adminPage.request.get(`${BASE}/app/${APP.slug}`)).status()).toBe(200);
  // Every step was audited.
  const actions = (await sql<{ action: string }>(`select action from "AuditLog" where "targetId" = $1 or CAST(metadata AS CHAR) like $2`, [APP.id, `%${APP.id}%`])).map((r) => r.action);
  for (const a of ["listing.revision.approve", "listing.suspended", "listing.restore", "security.scan.manual"]) expect(actions).toContain(a);
});
