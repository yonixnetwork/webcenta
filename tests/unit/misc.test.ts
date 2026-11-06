import { describe, expect, it } from "vitest";
import { allowedAgeRatings } from "@/server/catalog/visibility";
import { clientIp, normalizeCountry } from "@/server/viewer";
import { deviceFromUserAgent, visitorHash } from "@/server/analytics/visitor";
import { backoffSeconds } from "@/server/jobs/runner";
import { parseSurface } from "@/server/analytics/outbound";

describe("visibility helpers", () => {
  it("never allows 18+ for the default anonymous viewer", () => {
    expect(allowedAgeRatings("AGE_16_PLUS")).toEqual(["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS"]);
  });
});

describe("viewer", () => {
  it.each([["de", "DE"], ["XX", null], ["T1", null], ["", null], ["DEU", null], [null, null]] as const)("normalizeCountry(%s)", (i, o) =>
    expect(normalizeCountry(i)).toBe(o));
  it("uses the address added by the trusted proxy, not spoofed entries", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientIp(h, 1)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }), 1)).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }), 1)).toBe("198.51.100.1");
  });
});

describe("analytics", () => {
  it("hash changes with the daily salt and never contains the IP", () => {
    const a = visitorHash("salt-a", "203.0.113.9", "UA", "l1");
    expect(a).toBe(visitorHash("salt-a", "203.0.113.9", "UA", "l1"));
    expect(a).not.toBe(visitorHash("salt-b", "203.0.113.9", "UA", "l1"));
    expect(a).not.toContain("203");
  });
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148", "MOBILE"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "TABLET"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120", "DESKTOP"],
    ["Googlebot/2.1", "BOT"], ["curl/8.0", "BOT"], [null, "UNKNOWN"],
  ] as const)("device %s", (ua, d) => expect(deviceFromUserAgent(ua)).toBe(d));
  it("only accepts known surfaces", () => {
    expect(parseSurface("search")).toBe("search");
    expect(parseSurface("<script>")).toBe("unknown");
  });
});

describe("jobs", () => {
  it("backs off exponentially with a cap", () => {
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(3)).toBe(120);
    expect(backoffSeconds(20)).toBe(3600);
  });
});
