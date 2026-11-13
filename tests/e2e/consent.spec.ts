import { expect, test } from "@playwright/test";
import { BASE } from "./helpers";

/** The cookie question, legal pages and the age gate, in a browser with no cookies. */
test("asks for cookie consent once and remembers the choice", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const dialog = page.getByTestId("cookie-consent");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Necessary only" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await ctx.cookies()).find((c) => c.name === "wc-consent")?.value).toBe("v1.a0.d0");
  await page.reload();
  await expect(page.getByTestId("cookie-consent")).toHaveCount(0);
  // Reopened from the footer.
  await page.getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByTestId("cookie-consent")).toBeVisible();
  await ctx.close();
});

test("every footer policy link shows a published policy", async ({ page }) => {
  for (const [path, title] of [["/legal/terms", "Terms of Service"], ["/legal/privacy", "Privacy Policy"], ["/legal/content", "Content Policy"], ["/legal/cookies", "Cookie Policy"]] as const) {
    await page.goto(`${BASE}${path}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("has not been published yet")).toHaveCount(0);
    await expect(page.getByText(/Version \d+ · effective/)).toBeVisible();
  }
});

test("adults-only categories are gated for visitors", async ({ page }) => {
  await page.goto(`${BASE}/c/adult-entertainment`);
  await expect(page.getByRole("heading", { name: /is for adults/ })).toBeVisible();
  await page.goto(`${BASE}/categories`);
  await expect(page.getByRole("link", { name: /Adult Content/ })).toHaveCount(0);
});

test("sign-up refuses people under 13", async ({ page }) => {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Name").fill("Kid");
  await page.getByLabel("Email").fill(`kid-${Date.now()}@example.test`);
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - 10);
  await page.getByLabel("Date of birth").fill(d.toISOString().slice(0, 10));
  await page.getByLabel(/^Password/).fill("correct-horse-battery-staple");
  await page.getByLabel("Confirm password").fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/at least 13 years old/)).toBeVisible();
});
