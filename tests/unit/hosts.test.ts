import { describe, expect, it } from "vitest";
import { buildCsp, classifyHost, hostConfigFromEnv, isInternalSurfacePath } from "@/lib/hosts";

const cfg = hostConfigFromEnv({
  PUBLIC_ORIGIN: "https://webcenta.com", ADMIN_ORIGIN: "https://admin.webcenta.com", DEVELOPER_ORIGIN: "https://developers.webcenta.com",
});

describe("classifyHost", () => {
  it.each([
    ["webcenta.com", "public"], ["WWW.webcenta.com", "www"], ["admin.webcenta.com", "admin"],
    ["developers.webcenta.com", "developer"], ["evil.com", "unknown"], ["admin.webcenta.com.evil.com", "unknown"],
    [null, "unknown"], ["", "unknown"],
  ] as const)("%s → %s", (host, surface) => expect(classifyHost(host, cfg)).toBe(surface));
});

describe("isInternalSurfacePath", () => {
  it.each(["/admin-host", "/admin-host/x", "/ADMIN-HOST/x", "/developer-host"])("blocks %s", (p) => expect(isInternalSurfacePath(p)).toBe(true));
  it.each(["/admin-hostile", "/app/admin-host", "/"])("allows %s", (p) => expect(isInternalSurfacePath(p)).toBe(false));
});

describe("buildCsp", () => {
  it("uses a nonce and strict defaults in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
  it("only the outbound interstitial may submit forms that redirect to https sites", () => {
    expect(buildCsp("n", false)).toContain("form-action 'self';");
    expect(buildCsp("n", false, undefined, true)).toContain("form-action 'self' https:");
  });
  it("adds the media origin to img-src", () => expect(buildCsp("n", false, "https://media.example")).toContain("img-src 'self' data: blob: https://media.example"));
});
