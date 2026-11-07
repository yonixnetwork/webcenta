import { readFileSync, writeFileSync } from "node:fs";
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
    // Never-visited page → offline fallback.
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    // Account/auth pages are never cached; offline they show the fallback, not stale private data.
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await context.setOffline(false);
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1, name: "About Webcenta" })).toBeVisible();
  });

  test("an updated service worker triggers the update prompt and reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    // Publish a new service-worker version (as a deployment would), then restore it.
    const original = readFileSync("public/sw.js", "utf8");
    try {
      writeFileSync("public/sw.js", original.replace('const VERSION = "wc-v1"', 'const VERSION = "wc-v2"'));
      await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg?.update(); });
      await expect(page.getByText("A new version of Webcenta is available.")).toBeVisible({ timeout: 15_000 });
      const reload = page.waitForEvent("load");
      await page.getByRole("button", { name: "Reload" }).click();
      await reload;
      await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith("wc-v2")))).toBe(true);
    } finally {
      writeFileSync("public/sw.js", original);
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
