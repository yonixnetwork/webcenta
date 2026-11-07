import { describe, expect, it } from "vitest";
import { embeddedIpv4, isBlockedHostname, isBlockedIp } from "@/server/scanner/net";
import { validateUrl } from "@/server/scanner/safe-fetch";
import { normalizeDomain } from "@/server/developer/domain-verification";

describe("SSRF guards", () => {
  it.each([
    "127.0.0.1", "127.255.255.254", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1",
    "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "64:ff9b::7f00:1", "2001:db8::1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"])("allows public %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
  it("extracts IPv4 from mapped IPv6 forms", () => {
    expect(embeddedIpv4("::ffff:10.0.0.1")).toBe("10.0.0.1");
    expect(embeddedIpv4("::ffff:a00:1")).toBe("10.0.0.1");
  });
  it.each(["localhost", "LOCALHOST.", "foo.localhost", "printer.local", "metadata.google.internal", "router.home.arpa", "intranet"])("blocks hostname %s", (h) => expect(isBlockedHostname(h)).toBe(true));
  it.each([
    ["file:///etc/passwd", "BAD_SCHEME"], ["gopher://example.com", "BAD_SCHEME"], ["https://user:pw@example.com", "CREDENTIALS"],
    ["https://example.com:8443/", "BAD_PORT"], ["http://127.0.0.1/", "BLOCKED_ADDRESS"], ["http://[::1]/", "BLOCKED_ADDRESS"],
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_ADDRESS"], ["http://localhost/", "BLOCKED_HOST"], ["http://2130706433/", "BLOCKED_ADDRESS"],
  ])("validateUrl rejects %s", async (url, code) => {
    await expect(validateUrl(url)).rejects.toMatchObject({ code });
  });
  it.each(["169.254.169.254", "10.0.0.5", "127.0.0.1", "localhost", "metadata.google.internal", "http://", "a", "-bad-.com"])("domain verification rejects %s", (d) => {
    expect(normalizeDomain(d)).toBeNull();
  });
  it("normalises valid domains", () => expect(normalizeDomain("https://App.Example.com/path")).toBe("app.example.com"));
});
