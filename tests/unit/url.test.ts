import { describe, expect, it } from "vitest";
import { displayDomain, isSafeRelativePath, isValidSlug, normalizeWebsiteUrl, slugify } from "@/lib/url";

describe("normalizeWebsiteUrl", () => {
  it("accepts https and lower-cases the host", () => {
    expect(normalizeWebsiteUrl(" https://Example.COM/path#frag ")?.toString()).toBe("https://example.com/path");
  });
  it.each([
    "http://example.com", "javascript:alert(1)", "ftp://example.com", "https://user:pass@example.com",
    "https://example.com:8443", "https://localhost", "not a url", "data:text/html,hi",
  ])("rejects %s", (u) => expect(normalizeWebsiteUrl(u)).toBeNull());
});

describe("displayDomain", () => {
  it("strips www", () => expect(displayDomain("https://www.example.com/x")).toBe("example.com"));
  it("returns empty for garbage", () => expect(displayDomain("::")).toBe(""));
});

describe("isSafeRelativePath", () => {
  it.each(["/", "/app/x", "/search?q=1"])("allows %s", (p) => expect(isSafeRelativePath(p)).toBe(true));
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "app", "/x\r\nSet-Cookie: a"])("rejects %s", (p) =>
    expect(isSafeRelativePath(p)).toBe(false));
});

describe("slugify", () => {
  it("normalises names", () => {
    expect(slugify("Café & Bar — Tools!")).toBe("cafe-and-bar-tools");
    expect(isValidSlug(slugify("AI chatbots"))).toBe(true);
  });
});
