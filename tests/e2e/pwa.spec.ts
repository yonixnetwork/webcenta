import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The copy the server actually serves: the standalone server uses its own public/ folder. */
const SERVED_SW = existsSync(".next/standalone/public/sw.js") ? ".next/standalone/public/sw.js" : "public/sw.js";
import { expect, test } from "@playwright/test";

/** 10. A user installs Webcenta as a PWA and navigates through the marketplace. */
test.describe("PWA", () => {
  test("manifest and icons satisfy installability requirements", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({ name: expect.stringContaining("Webcenta"), short_name: "Webcenta", start_url: expect.stringMatching(/^\//), scope: "/", display: "standalone" });
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    for (const icon of m.icons) {
      const r = await request.get(icon.src);
      expect(r.status(), icon.src).toBe(200);
      expect(r.headers()["content-type"]).toBe("image/png");
    }
    const apple = await request.get("/icons/apple-touch-icon.png");
    expect(apple.status()).toBe(200);
  });

  test("service worker controls the page, serves visited pages offline and shows an offline fallback", async ({ page, context }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // Browse while online (pages are cached network-first).
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1, name: "All categories" })).toBeVisible();
    await page.goto("/c/productivity");
    await context.setOffline(true);
    // Previously visited page still works offline.
    await page.goto("/categories");
    await expect(page.getByRole("heading", { level: 1, name: "All categories" })).toBeVisible();
    // Account/auth pages are never cached; offline they show the fallback, not stale private data.
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "You're currently offline." })).toBeVisible();
    // Never-visited page → branded offline fallback, fully styled from the precache.
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "You're currently offline." })).toBeVisible();
    await expect(page.getByText("Please check your internet connection and try again.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Webcenta home" })).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry" });
    expect(await retry.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    // Retry really checks the network: still offline → it says so and stays here.
    await retry.click();
    await expect(page.getByText(/Still no connection/)).toBeVisible();
    expect(page.url()).toMatch(/\/about$/);
    // Back online → the page that was originally requested loads again automatically.
    await context.setOffline(false);
    await expect(page.getByRole("heading", { level: 1, name: "About Webcenta" })).toBeVisible();
    expect(page.url()).toMatch(/\/about$/);
    // Manual Retry with a working connection: from /offline itself it continues to the homepage.
    await page.goto("/offline");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Find the right web app");
  });

  test("an updated service worker triggers the update prompt and reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    // Publish a new service-worker version (as a deployment would), then restore it.
    const original = readFileSync(SERVED_SW, "utf8");
    try {
      // Simulate a deploy: the next cache version, whatever the current one is.
      const current = Number(/const VERSION = "wc-v(\d+)"/.exec(original)![1]);
      const next = `wc-v${current + 1}`;
      writeFileSync(SERVED_SW, original.replace(`const VERSION = "wc-v${current}"`, `const VERSION = "${next}"`));
      await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg?.update(); });
      await expect(page.getByText("Webcenta has been updated.")).toBeVisible({ timeout: 15_000 });
      const reload = page.waitForEvent("load");
      await page.getByRole("button", { name: "Reload" }).click();
      await reload;
      await expect.poll(() => page.evaluate(async (v: string) => (await caches.keys()).some((k) => k.startsWith(v)), next)).toBe(true);
    } finally {
      writeFileSync(SERVED_SW, original);
    }
  });

  test("Android/desktop: the install prompt is offered and triggered from the banner", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready); // the app's PWA handler is mounted
    // Chromium only fires beforeinstallprompt for real installable sites under engagement heuristics;
    // dispatch an equivalent event to exercise Webcenta's handling of it.
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };
      e.prompt = async () => { (window as unknown as { __prompted: boolean }).__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(e);
    });
    const banner = page.getByTestId("install-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("not an app-store app");
    await banner.getByRole("button", { name: "Install" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
    await expect(banner).toBeHidden();
    // The installed app navigates normally.
    await page.goto("/?source=pwa");
    await page.getByRole("link", { name: "All categories" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "All categories" })).toBeVisible();
  });
});

test.describe("PWA on iOS Safari (emulated user agent)", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  test("shows Add-to-Home-Screen instructions instead of a native prompt", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    const banner = page.getByTestId("install-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Install" }).click();
    const dialog = page.getByRole("dialog", { name: "Add Webcenta to your Home Screen" });
    await expect(dialog).toContainText("Add to Home Screen");
    await dialog.getByRole("button", { name: "Got it" }).click();
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await page.reload();
    await expect(page.getByTestId("install-banner")).toHaveCount(0); // dismissal remembered
  });
});
