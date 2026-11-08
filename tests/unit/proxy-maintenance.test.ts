import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } });

describe("proxy: maintenance mode and error routing", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://webcenta.com");
    vi.stubEnv("ADMIN_ORIGIN", "https://admin.webcenta.com");
    vi.stubEnv("DEVELOPER_ORIGIN", "https://developers.webcenta.com");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves a real 503 with Retry-After and the branded page to public visitors", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    const res = await proxy(req("https://webcenta.com/app/anything"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("600");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await res.text();
    expect(html).toContain("Webcenta is temporarily unavailable");
    expect(html).toContain("Error 503");
  });

  it("returns JSON 503 for the public API but keeps cron and the admin portal running", async () => {
    vi.stubEnv("MAINTENANCE_MODE", "true");
    vi.stubEnv("MAINTENANCE_RETRY_AFTER", "120");
    const api = await proxy(req("https://webcenta.com/api/search?q=x"));
    expect(api.status).toBe(503);
    expect(api.headers.get("retry-after")).toBe("120");
    expect(await api.json()).toEqual({ error: "Service temporarily unavailable", maintenance: true });
    expect((await proxy(req("https://webcenta.com/api/cron/tick"))).status).toBe(200);
    expect((await proxy(req("https://admin.webcenta.com/"))).status).toBe(200);
  });

  it("is off by default", async () => {
    const res = await proxy(req("https://webcenta.com/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe("/");
  });

  it("flags responses for signed-in visitors so the service worker skips them", async () => {
    const signedIn = new NextRequest("https://webcenta.com/categories", { headers: { host: "webcenta.com", cookie: "__Secure-wc.session_token=abc" } });
    expect((await proxy(signedIn)).headers.get("x-wc-personal")).toBe("1");
    expect((await proxy(req("https://webcenta.com/categories"))).headers.get("x-wc-personal")).toBeNull();
  });
});

describe("proxy: api host", () => {
  beforeEach(() => vi.stubEnv("PUBLIC_ORIGIN", "https://webcenta.com"));
  afterEach(() => vi.unstubAllEnvs());
  it("serves /api/* and redirects every other path to the main site", async () => {
    const api = await proxy(req("https://api.webcenta.com/api/health"));
    expect(api.status).toBe(200);
    expect(api.headers.get("x-robots-tag")).toContain("noindex");
    const other = await proxy(req("https://api.webcenta.com/app/x?y=1"));
    expect(other.status).toBe(308);
    expect(other.headers.get("location")).toBe("https://webcenta.com/app/x?y=1");
  });
});
