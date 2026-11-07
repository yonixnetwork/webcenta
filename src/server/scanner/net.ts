import { BlockList, isIP } from "node:net";

/**
 * Address ranges a scanner must never connect to (SSRF protection):
 * loopback, private, link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT, multicast, reserved/documentation ranges, NAT64 and IPv4-mapped IPv6.
 */
const blocked = new BlockList();
const V4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4], ["255.255.255.255", 32],
];
const V6: Array<[string, number]> = [
  // NOTE: do not list ::ffff:0:0/96 here — Node's BlockList checks IPv4 addresses against
  // IPv6 rules through that mapping, which would block every IPv4 address. Mapped forms
  // are handled explicitly by embeddedIpv4() below.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
];
for (const [a, p] of V4) blocked.addSubnet(a, p, "ipv4");
for (const [a, p] of V6) blocked.addSubnet(a, p, "ipv6");

const BLOCKED_HOSTNAMES = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\.google\.internal$/i, /\.home\.arpa$/i, /^[^.]+$/];

/** Extracts the IPv4 address from IPv4-mapped/compatible IPv6 forms. */
export function embeddedIpv4(ip: string): string | null {
  const m = ip.toLowerCase().match(/^(?:0*:)*(?:::)?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? ip.toLowerCase().match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return m[1]!;
  const hex = ip.toLowerCase().match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const n = (parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16);
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  return null;
}

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true; // not an IP → refuse
  if (family === 4) return blocked.check(ip, "ipv4");
  const v4 = embeddedIpv4(ip);
  if (v4) return blocked.check(v4, "ipv4");
  return blocked.check(ip, "ipv6");
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return BLOCKED_HOSTNAMES.some((r) => r.test(h));
}

/**
 * Test-mode escape hatch: allows loopback for "*.localhost" fixture sites, but
 * ONLY when the app itself runs on a localhost origin. It can never activate on a
 * real deployment (PUBLIC_ORIGIN is https://webcenter.com there).
 */
export function testModeAllowsLoopback(): boolean {
  if (process.env.SCANNER_ALLOW_PRIVATE_FOR_TESTS !== "true") return false;
  try {
    return new URL(process.env.PUBLIC_ORIGIN ?? "").hostname === "localhost";
  } catch {
    return false;
  }
}
