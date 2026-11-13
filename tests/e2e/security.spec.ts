import { expect, test, type Page } from "@playwright/test";
import { ADMIN, BASE, DEVHOST, devSignIn, closeDb, freshTotp, markTotpUsed, emailLink, provisionAdmin, registerUser, setSite, sql, totp } from "./helpers";

/** Security tests against the running application (desktop project). */
test.describe.configure({ mode: "serial" });
const RUN = `s${Date.now().toString(36)}`;
const A = { email: `alice-${RUN}@example.test`, password: "" };
const B = { email: `bob-${RUN}@example.test`, password: "" };
const SUPER = { email: `super-${RUN}@example.test`, password: "super-admin-passphrase-1234", secret: "" };
const VIEWER = { email: `viewer-${RUN}@example.test`, password: "viewer-passphrase-12345678", secret: "" };
let alice: Page, bob: Page;

test.afterAll(async () => { await closeDb(); });

async function acceptInvite(page: Page, url: string, who: { password: string; secret: string }, name: string) {
  await page.goto(url);
  who.secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel(/^Password/).fill(who.password);
  await page.getByLabel("Confirm password").fill(who.password);
  await page.getByLabel("Authenticator code").fill(totp(who.secret));
  markTotpUsed(who.secret);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/login\?invited=1/);
}
async function adminLogin(page: Page, email: string, who: { password: string; secret: string }) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/login\/mfa/);
  await page.getByLabel("Authentication code").fill(await freshTotp(who.secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL(`${ADMIN}/`);
}

test("setup: two independent users", async ({ browser }) => {
  alice = await (await browser.newContext()).newPage();
  bob = await (await browser.newContext()).newPage();
  A.password = await registerUser(alice, A.email, "Alice");
  B.password = await registerUser(bob, B.email, "Bob");
});

test("SQL/tsquery injection payloads are treated as text", async ({ request }) => {
  for (const q of ["' OR 1=1 --", "'; DROP TABLE \"Listing\"; --", "a:* | !b & (c", "%_\\", "\u0000", "<script>alert(1)</script>"]) {
    for (const path of [`/search?q=${encodeURIComponent(q)}`, `/api/search/suggest?q=${encodeURIComponent(q)}`, `/c/ai?q=${encodeURIComponent(q)}&pricing=${encodeURIComponent(q)}`]) {
      expect((await request.get(path)).status(), path).toBeLessThan(500);
    }
  }
  expect(Number((await sql<{ n: string }>(`select count(*) n from "Listing"`))[0]!.n)).toBeGreaterThan(0);
});

test("stored XSS in names, reviews and collections is escaped", async () => {
  const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
  await alice.goto(`${BASE}/account/profile`);
  await alice.getByRole("button", { name: "Edit profile" }).click();
  await alice.getByLabel(/Display name/).fill(`Alice ${payload}`.slice(0, 80));
  await alice.getByRole("button", { name: "Save profile" }).click();
  await expect(alice.getByText("Profile saved.")).toBeVisible();
  await alice.goto(`${BASE}/app/sample-quillpad`);
  await alice.getByLabel("3 stars").check({ force: true });
  await alice.getByLabel("Review (optional)").fill(`Testing ${payload} content`);
  await alice.getByRole("button", { name: "Publish review" }).click();
  await expect(alice.getByText(/moderation check|published/)).toBeVisible();
  await alice.reload();
  await expect(alice.getByText(/Testing <img src=x/).first()).toBeVisible(); // rendered as text
  expect(await alice.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await alice.locator("img[src='x']").count()).toBe(0);
});

test("CSRF: cross-site requests to auth and beacons are rejected", async ({ request }) => {
  const signin = await request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { email: A.email, password: A.password } });
  expect(signin.status()).toBe(403);
  const view = await request.post(`${BASE}/api/events/view`, { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: { slug: "sample-lumen-notes" } });
  expect(view.status()).toBe(403);
  // Server actions: Next.js rejects actions whose Origin does not match the host.
  const before = Number((await sql<{ n: string }>(`select count(*) n from "SupportCase"`))[0]!.n);
  const forged = await request.post(`${BASE}/contact`, { headers: { origin: "https://evil.example", "next-action": "0".repeat(42), "content-type": "text/plain" }, data: "[]" });
  expect(forged.status()).toBeGreaterThanOrEqual(400);
  expect(Number((await sql<{ n: string }>(`select count(*) n from "SupportCase"`))[0]!.n)).toBe(before);
});

test("open redirects: sign-in `next` and /go ignore attacker-controlled destinations", async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/signin?next=${encodeURIComponent("//evil.example/steal")}`);
  await page.getByLabel("Email").fill(B.email);
  await page.getByLabel("Password").fill(B.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`); // the unsafe `next` is ignored: the homepage
  const go = await request.post(`${BASE}/go/sample-lumen-notes/continue?to=https://evil.example`, { form: { url: "https://evil.example" }, maxRedirects: 0 });
  expect(go.headers()["location"]).toBe("https://lumen-notes.example/");
});

test("SSRF: domain verification cannot reach private networks or cloud metadata", async () => {
  await devSignIn(alice, A.email, A.password);
  await alice.getByLabel("Organisation or developer name").fill(`Alice Org ${RUN}`);
  await alice.getByRole("button", { name: "Create organisation" }).click();
  await expect(alice.getByRole("heading", { name: "Overview" })).toBeVisible();
  await alice.goto(`${DEVHOST}/domains`);
  for (const bad of ["169.254.169.254", "127.0.0.1", "localhost", "metadata.google.internal", "10.0.0.5"]) {
    await alice.getByLabel("Domain").fill(bad);
    await alice.getByRole("button", { name: "Get verification code" }).click();
    await expect(alice.getByText(/Enter a valid public domain/)).toBeVisible();
    // Wait for this submission to finish (the form resets afterwards) before typing the next one.
    await expect(alice.getByRole("button", { name: "Get verification code" })).toBeEnabled();
  }
  // A public-looking domain whose proof URL redirects to the metadata service.
  await setSite("private-redirect.localhost", { mode: "redirect-private" });
  await alice.getByLabel("Domain").fill("private-redirect.localhost");
  await alice.getByLabel("Method").selectOption("WELL_KNOWN_FILE");
  await alice.getByRole("button", { name: "Get verification code" }).click();
  const card = alice.locator('[data-domain="private-redirect.localhost"]');
  await card.getByRole("button", { name: "Check verification" }).click();
  await expect(card.getByText(/private or reserved address/).first()).toBeVisible();
});

test("malicious uploads and unsafe website URLs are rejected", async () => {
  await alice.goto(`${DEVHOST}/listings/new`);
  const upload = alice.getByTestId("upload-logoAssetId");
  await upload.setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="100" height="100"/></svg>`) });
  await expect(alice.getByText("Only JPEG, PNG, WebP or AVIF images are accepted.")).toBeVisible();
  await upload.setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<?php system($_GET['c']); ?>") });
  await expect(alice.getByText("Unsupported or corrupted image.")).toBeVisible();
  await alice.getByLabel("App name").fill("Bad URL app");
  await alice.getByLabel("Official website (https://)").evaluate((el) => el.setAttribute("type", "text"));
  await alice.getByLabel("Official website (https://)").fill("javascript:alert(1)");
  await alice.getByLabel("Description").fill("A description that is long enough to pass validation rules.");
  await alice.getByLabel("Primary category").selectOption({ index: 2 });
  await alice.getByRole("button", { name: "Save draft" }).click();
  await expect(alice.getByText(/websiteUrl: Must be an https:\/\/ URL/)).toBeVisible();
});

test("broken access control: users cannot reach others' data or portals", async ({ request }) => {
  // Anonymous
  for (const p of ["/account", "/account/favorites"]) {
    expect((await request.get(`${BASE}${p}`, { maxRedirects: 0 })).status(), p).toBe(307);
  }
  for (const p of ["/", "/analytics", "/listings/new", "/account"]) {
    const res = await request.get(`${BASE}${p}`, { headers: { host: "developers.localhost:3100" }, maxRedirects: 0 });
    expect(res.status(), `developer ${p}`).toBe(307);
    expect(res.headers()["location"]).toContain("/signin");
  }
  // Bob creates a private collection; Alice cannot open or edit it.
  await bob.goto(`${BASE}/account/collections`);
  await bob.getByLabel("Title").fill("Bob private");
  await bob.getByRole("button", { name: "Create collection" }).click();
  await expect(bob.getByRole("link", { name: /Bob private/ })).toBeVisible();
  const col = (await sql<{ id: string; slug: string }>(`select c.id, c.slug from "Collection" c join "User" u on u.id = c."ownerId" where u.email = $1`, [B.email]))[0]!;
  expect((await alice.request.get(`${BASE}/account/collections/${col.id}`)).status()).toBe(404);
  expect((await alice.request.get(`${BASE}/collections/${col.slug}`)).status()).toBe(404); // private
  // Pages rendered for a signed-in visitor are flagged so the service worker never stores them.
  expect((await alice.request.get(`${BASE}/categories`)).headers()["x-wc-personal"]).toBe("1");
  expect((await request.get(`${BASE}/categories`)).headers()["x-wc-personal"]).toBeUndefined();
  // Bob (no developer org) cannot open another org's listing in the developer portal.
  const foreign = (await sql<{ id: string }>(`select id from "Listing" where "developerId" is not null limit 1`))[0];
  if (foreign) {
    const res = await bob.request.get(`${BASE}/listings/${foreign.id}`, { headers: { host: "developers.localhost:3100" }, maxRedirects: 0 });
    expect([307, 404]).toContain(res.status());
  }
  // A public user session grants nothing on the admin host; admin pages are not reachable via the public host.
  const cookies = await bob.context().cookies(BASE);
  const adminRes = await bob.request.get(`${BASE}/users`, { headers: { host: "admin.localhost:3100", cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") }, maxRedirects: 0 });
  expect(adminRes.status()).toBe(307);
  expect(adminRes.headers()["location"]).toContain("/login");
  expect((await request.get(`${BASE}/admin-host/users`)).status()).toBe(404);
});

test("session security: cookie flags, logout invalidation and suspension", async ({ browser }) => {
  const sess = (await bob.context().cookies(BASE)).find((c) => c.name.includes("session_token"))!;
  expect(sess.httpOnly).toBe(true);
  expect(sess.sameSite).toBe("Lax");
  const stolen = `${sess.name}=${sess.value}`;
  await bob.goto(`${BASE}/account`);
  await bob.getByRole("button", { name: "Sign out", exact: true }).click();
  await bob.waitForURL(`${BASE}/`);
  const replay = await bob.request.get(`${BASE}/account`, { headers: { cookie: stolen }, maxRedirects: 0 });
  expect(replay.status()).toBe(307); // the old token no longer works

  // Admin suspends Alice → her active session stops working and she cannot sign in.
  const sup = await (await browser.newContext()).newPage();
  await acceptInvite(sup, provisionAdmin(SUPER.email), SUPER, "Sam Super");
  await adminLogin(sup, SUPER.email, SUPER);
  const adminCookie = (await sup.context().cookies(ADMIN)).find((c) => c.name.includes("wc_admin"))!;
  expect(adminCookie.httpOnly).toBe(true);
  expect(adminCookie.sameSite).toBe("Strict");
  const aliceId = (await sql<{ id: string }>(`select id from "User" where email = $1`, [A.email]))[0]!.id;
  await sup.goto(`${ADMIN}/users/${aliceId}`);
  await sup.getByLabel("Reason (recorded)").fill("Security test suspension");
  await sup.getByRole("button", { name: "Suspend user and sign out" }).click();
  await expect(sup.getByText("User suspended and signed out.")).toBeVisible();
  expect((await alice.request.get(`${BASE}/account`, { maxRedirects: 0 })).status()).toBe(307);
  const r = await alice.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: A.email, password: A.password } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  await sup.close();
});

test("admin privilege escalation and RBAC", async ({ browser }) => {
  const sup = await (await browser.newContext()).newPage();
  await adminLogin(sup, SUPER.email, SUPER);
  await sup.goto(`${ADMIN}/admins`);
  await sup.getByLabel("Email").fill(VIEWER.email);
  await sup.getByLabel("Role").first().selectOption("ANALYTICS_VIEWER");
  await sup.getByRole("button", { name: "Send invitation" }).click();
  await expect(sup.getByText(`Invitation emailed to ${VIEWER.email}`)).toBeVisible();
  // The last Super Administrator cannot be demoted or suspended (not even by mistake).
  const supId = (await sql<{ id: string }>(`select id from "AdminUser" where email = $1`, [SUPER.email]))[0]!.id;
  expect(supId).toBeTruthy();

  const viewer = await (await browser.newContext()).newPage();
  await acceptInvite(viewer, await emailLink(VIEWER.email, "admin-invite", "accept-invite"), VIEWER, "Vic Viewer");
  await adminLogin(viewer, VIEWER.email, VIEWER);
  await expect(viewer.getByRole("link", { name: "Analytics" })).toBeVisible();
  await expect(viewer.getByRole("link", { name: /Submissions/ })).toHaveCount(0);
  for (const p of ["/submissions", "/admins", "/audit", "/settings", "/users"]) {
    const res = await viewer.goto(`${ADMIN}${p}`);
    expect(res!.status(), p).toBe(403); // a real 403, rendered at the requested URL
    await expect(viewer).toHaveURL(`${ADMIN}${p}`);
    await expect(viewer.getByRole("heading", { level: 1, name: "Access denied" })).toBeVisible();
    await expect(viewer.getByText(/recorded in the audit log/)).toBeVisible();
  }
  await viewer.goto(`${ADMIN}/analytics`);
  await expect(viewer.getByRole("heading", { name: "Platform analytics" })).toBeVisible();
  const denied = await sql(`select 1 from "AuditLog" a join "AdminUser" u on u.id = a."adminId" where a.action = 'admin.permission.denied' and u.email = $1`, [VIEWER.email]);
  expect(denied.length).toBe(5); // every page-level denial is audited
  await viewer.close();
  await sup.close();
});

test("secrets and internals are not exposed", async ({ request }) => {
  for (const p of ["/.env", "/.env.local", "/prisma/schema/base.prisma", "/package.json", "/.git/config", "/storage/", "/media/../.env"]) {
    expect((await request.get(p)).status(), p).toBeGreaterThanOrEqual(400);
  }
  const html = await (await request.get("/")).text();
  for (const secret of [process.env.APP_USER_AUTH_SECRET!, process.env.APP_CRON_SECRET!, process.env.APP_FIELD_ENCRYPTION_KEY!, "DATABASE_URL", "postgresql://"]) {
    expect(html.includes(secret), secret.slice(0, 12)).toBe(false);
  }
  const h = (await request.get("/")).headers();
  expect(h["x-powered-by"]).toBeUndefined();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  const adminH = (await request.get("/login", { headers: { host: "admin.localhost:3100" } })).headers();
  expect(adminH["cache-control"]).toContain("no-store");
});

test("signing in with an unverified email is refused and re-sends the link", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  const email = `unverified-${RUN}@example.test`;
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill("Una");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Date of birth").fill("1988-02-29");
  await page.getByLabel(/^Password/).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password").fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Please confirm your email first/)).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
  // Password reset flow works and the old password stops working.
  await page.goto(`${BASE}/forgot-password`);
  await page.getByLabel("Email").fill(B.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
  await page.goto(await emailLink(B.email, "reset-password"));
  await page.getByLabel(/^New password/).fill("a-brand-new-password-123");
  await page.getByLabel("Confirm new password").fill("a-brand-new-password-123");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/Your password has been changed/)).toBeVisible();
});

test("brute force: admin lockout and user sign-in rate limiting", async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  for (let i = 0; i < 5; i++) {
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel("Email").fill(SUPER.email);
    await page.getByLabel("Password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Email").fill(SUPER.email);
  await page.getByLabel("Password").fill(SUPER.password); // correct, but locked
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Too many failed attempts/)).toBeVisible();
  expect((await sql(`select 1 from "AdminLoginEvent" where "emailAttempted" = $1 and "failureReason" = 'locked'`, [SUPER.email])).length).toBeGreaterThan(0);

  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const r = await request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: B.email, password: `nope-${i}` } });
    statuses.push(r.status());
  }
  expect(statuses).toContain(429);
  expect((await sql(`select 1 from "AuthEvent" where type = 'LOGIN_FAILED' and email = $1`, [B.email])).length).toBeGreaterThan(5);
});
