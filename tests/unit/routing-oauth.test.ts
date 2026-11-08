import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { developerRewritePath, hostConfigFromEnv, resolveSurface } from "@/lib/hosts";
import { appleClientSecret, normalizeApplePrivateKey, validateApplePrivateKey } from "@/server/auth/apple";
import { sectionById } from "@/server/settings/registry";
import { __test, missingFields } from "@/server/settings/store";
import { proxy } from "@/proxy";

const cfg = hostConfigFromEnv({ PUBLIC_ORIGIN: "https://webcenta.com" });
const hdrs = (o: Record<string, string>) => new Headers(o);

describe("hostname resolution", () => {
  it("derives all hosts from PUBLIC_ORIGIN", () => expect(cfg).toEqual({ publicHost: "webcenta.com", adminHost: "admin.webcenta.com", developerHost: "developers.webcenta.com" }));
  it.each([
    [{ host: "webcenta.com" }, "public"], [{ host: "www.webcenta.com" }, "www"], [{ host: "admin.webcenta.com" }, "admin"], [{ host: "developers.webcenta.com" }, "developer"],
    // A proxy that rewrites Host: X-Forwarded-Host is used only then.
    [{ host: "127.0.0.1:3000", "x-forwarded-host": "admin.webcenta.com" }, "admin"],
    [{ host: "localhost:3000", "x-forwarded-host": "developers.webcenta.com, proxy.internal" }, "developer"],
    // Never moves a request between two of our own hosts.
    [{ host: "webcenta.com", "x-forwarded-host": "admin.webcenta.com" }, "public"],
    [{ host: "evil.example", "x-forwarded-host": "evil.example" }, "unknown"],
  ] as const)("%j → %s", (h, surface) => expect(resolveSurface(hdrs(h), cfg).surface).toBe(surface));
  it("serves developer pages from the developer-host tree, but shares API and media", () => {
    expect(developerRewritePath("/")).toBe("/developer-host");
    expect(developerRewritePath("/listings/new")).toBe("/developer-host/listings/new");
    expect(developerRewritePath("/api/auth/callback/google")).toBeNull();
    expect(developerRewritePath("/media/x.webp")).toBeNull();
  });
});

describe("proxy on the four hostnames", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://webcenta.com");
    vi.stubEnv("ADMIN_ORIGIN", "");
    vi.stubEnv("DEVELOPER_ORIGIN", "");
  });
  afterEach(() => vi.unstubAllEnvs());
  const req = (url: string, extra: Record<string, string> = {}) => new NextRequest(url, { headers: { host: new URL(url).host, ...extra } });
  const rewriteOf = (r: Response) => r.headers.get("x-middleware-rewrite");

  it("www → 308 to the apex, keeping path and query", async () => {
    const r = await proxy(req("https://www.webcenta.com/c/ai?x=1"));
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://webcenta.com/c/ai?x=1");
  });
  it("admin host renders the admin portal (never the marketplace)", async () => {
    const r = await proxy(req("https://admin.webcenta.com/settings"));
    expect(rewriteOf(r)).toContain("/admin-host/settings");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("developer host renders the developer portal, with shared auth API", async () => {
    expect(rewriteOf(await proxy(req("https://developers.webcenta.com/")))).toContain("/developer-host");
    expect(rewriteOf(await proxy(req("https://developers.webcenta.com/listings/abc")))).toContain("/developer-host/listings/abc");
    expect(rewriteOf(await proxy(req("https://developers.webcenta.com/api/auth/get-session")))).toBeNull();
  });
  it("old /developer links on the public site move to the developer host", async () => {
    const r = await proxy(req("https://webcenta.com/developer/listings/abc?saved=1"));
    expect(r.status).toBe(308);
    expect(r.headers.get("location")).toBe("https://developers.webcenta.com/listings/abc?saved=1");
    expect((await proxy(req("https://webcenta.com/developer"))).headers.get("location")).toBe("https://developers.webcenta.com/");
  });
  it("internal folders are never reachable by path", async () => {
    expect((await proxy(req("https://webcenta.com/developer-host/listings"))).status).toBe(404);
    expect((await proxy(req("https://webcenta.com/admin-host/settings"))).status).toBe(404);
  });
  it("routes behind a Host-rewriting proxy using X-Forwarded-Host", async () => {
    const r = await proxy(new NextRequest("http://127.0.0.1:3000/login", { headers: { host: "127.0.0.1:3000", "x-forwarded-host": "admin.webcenta.com" } }));
    expect(rewriteOf(r)).toContain("/admin-host/login");
  });
});

describe("Sign in with Apple client secret", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  it("signs an ES256 JWT Apple can verify, renewed daily, valid < 6 months", () => {
    const now = Date.UTC(2026, 10, 8, 15, 30);
    const { jwt, expiresAt } = appleClientSecret({ teamId: "ABCDE12345", keyId: "KEY1234567", clientId: "com.webcenta.signin", privateKey: pem }, now);
    const [h, p, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims).toMatchObject({ iss: "ABCDE12345", sub: "com.webcenta.signin", aud: "https://appleid.apple.com", iat: Date.UTC(2026, 10, 8) / 1000 });
    expect(claims.exp - claims.iat).toBeLessThan(183 * 86400);
    expect(expiresAt).toBe(claims.exp * 1000);
    const ok = createVerify("SHA256").update(`${h}.${p}`).verify({ key: createPublicKey(publicKey.export({ type: "spki", format: "pem" })), dsaEncoding: "ieee-p1363" }, Buffer.from(sig!, "base64url"));
    expect(ok).toBe(true);
    // Same day → same token (no auth rebuild per request).
    expect(appleClientSecret({ teamId: "ABCDE12345", keyId: "KEY1234567", clientId: "com.webcenta.signin", privateKey: pem }, now + 3600_000).jwt).toBe(jwt);
  });
  it("accepts a .p8 key with or without PEM armour and rejects other keys", () => {
    expect(validateApplePrivateKey(pem)).toBeNull();
    const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    expect(validateApplePrivateKey(body)).toBeNull();
    expect(normalizeApplePrivateKey(body)).toContain("BEGIN PRIVATE KEY");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(validateApplePrivateKey(rsa)).toMatch(/EC P-256/);
    expect(validateApplePrivateKey("garbage")).toMatch(/could not be read/);
  });
  it("is complete with a key (Team ID + Key ID + key) or a legacy JWT", () => {
    const apple = sectionById("apple")!;
    const r = (values: Record<string, string>) => __test.resolve(apple, __test.asStored({ enabled: true, values }), {});
    expect(missingFields(r({ clientId: "com.webcenta.signin" }))).toEqual(["teamId", "keyId", "privateKey"]);
    expect(missingFields(r({ clientId: "com.webcenta.signin", teamId: "ABCDE12345", keyId: "KEY1234567" }))).toEqual(["privateKey"]);
  });
});
