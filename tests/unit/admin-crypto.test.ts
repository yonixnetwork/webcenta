import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decrypt, encrypt, hashPassword, totpCode, verifyPassword, verifyTotp } from "@/server/admin/crypto";
import { can, ROLE_RANK, PERMISSIONS } from "@/server/admin/permissions";

describe("TOTP (RFC 6238 test vectors, SHA-1)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it.each([[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]])("t=%i → %s", (t, code) => {
    expect(totpCode(secret, Math.floor(t / 30))).toBe(code);
  });
  it("accepts ±1 step and rejects others / malformed codes", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, totpCode(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });
  it("base32 round-trips", () => expect(base32Decode(base32Encode(Buffer.from("hello world"))).toString()).toBe("hello world"));
});

describe("field encryption (AES-256-GCM)", () => {
  it("round-trips and detects tampering", () => {
    const blob = encrypt("JBSWY3DPEHPK3PXP");
    expect(blob).not.toContain("JBSWY3DP");
    expect(decrypt(blob)).toBe("JBSWY3DPEHPK3PXP");
    const parts = blob.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
  it("uses a fresh IV each time", () => expect(encrypt("x")).not.toBe(encrypt("x")));
});

describe("password hashing (scrypt)", () => {
  it("verifies and rejects", async () => {
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("RBAC matrix", () => {
  it("only Super Admins manage administrators", () => {
    for (const r of ["ADMIN", "MODERATOR", "SUPPORT_AGENT", "ANALYTICS_VIEWER"] as const) expect(can(r, "admins.manage")).toBe(false);
    expect(can("SUPER_ADMIN", "admins.manage")).toBe(true);
  });
  it("analytics viewers can only view analytics", () => {
    const allowed = (Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>).filter((p) => can("ANALYTICS_VIEWER", p));
    expect(allowed).toEqual(["analytics.view"]);
  });
  it("moderators cannot perform business verification or change settings", () => {
    expect(can("MODERATOR", "developers.verifyBusiness")).toBe(false);
    expect(can("MODERATOR", "settings.manage")).toBe(false);
    expect(can("MODERATOR", "listings.moderate")).toBe(true);
  });
  it("role ranks are strictly ordered", () => expect(Object.values(ROLE_RANK).sort()).toEqual([0, 1, 2, 3, 4]));
});
