// Local performance measurement (production build). Usage: node scripts/perf.mjs [baseUrl]
import { chromium, devices } from "playwright";
const BASE = process.argv[2] || "http://localhost:3100";
const PAGES = ["/", "/categories", "/c/productivity", "/search?q=notes", "/app/sample-lumen-notes", "/signin"];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const rows = [];
  for (const path of PAGES) {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); // mid-range phone
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }); // "Fast 3G"-like
    let jsBytes = 0, totalBytes = 0;
    cdp.on("Network.loadingFinished", (e) => { totalBytes += e.encodedDataLength; });
    page.on("response", async (r) => { if (r.url().endsWith(".js")) { const h = await r.headerValue("content-length"); jsBytes += Number(h || 0); } });
    await page.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { ttfb: Math.round(nav.responseStart), fcp: Math.round(fcp?.startTime ?? 0), lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(3)) };
    });
    rows.push({ page: path, ...m, transferKB: Math.round(totalBytes / 1024) });
    await page.close();
  }
  console.table(rows);
  // Server-side latency (no throttling): 30 sequential requests each.
  for (const path of ["/api/search/suggest?q=no", "/search?q=notes", "/app/sample-lumen-notes"]) {
    const times = [];
    for (let i = 0; i < 30; i++) { const t = Date.now(); await fetch(BASE + path); times.push(Date.now() - t); }
    times.sort((a, b) => a - b);
    console.log(`${path}: median ${times[15]} ms, p95 ${times[28]} ms`);
  }
  await browser.close();
})();
