import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Key material. ONE master key comes from the environment (FIELD_ENCRYPTION_KEY,
 * 32 random bytes, base64). Everything else is derived from it with HKDF-SHA256
 * so each purpose gets an independent key:
 *   - settings encryption (integration credentials stored in MySQL)
 *   - user session secret (Better Auth) and admin session secret, unless set explicitly
 *
 * Losing or changing the master key makes stored credentials unreadable, signs
 * every user out and breaks enrolled admin two-factor codes: keep a copy.
 */
export function masterKey(raw = process.env.FIELD_ENCRYPTION_KEY, nodeEnv = process.env.NODE_ENV): Buffer {
  if (!raw) {
    if (nodeEnv === "production") throw new Error("FIELD_ENCRYPTION_KEY is required in production (32 random bytes, base64).");
    return createHash("sha256").update("webcenta-development-only-key").digest();
  }
  const b = Buffer.from(raw, "base64");
  return b.length === 32 ? b : createHash("sha256").update(raw).digest();
}

export function deriveKey(purpose: string, raw?: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(raw), Buffer.alloc(0), `webcenta:${purpose}`, 32));
}

/** A derived secret as text (for libraries that take a string secret). */
export function derivedSecret(purpose: string, raw?: string): string {
  return deriveKey(purpose, raw).toString("base64url");
}

/**
 * AES-256-GCM with associated data: a ciphertext only decrypts for the setting
 * and field it was written for (it cannot be copied into another field).
 * Format: "s1:<iv>:<tag>:<ciphertext>" (base64).
 */
export function sealSecret(plain: string, aad: string, raw?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", deriveKey("settings", raw), iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["s1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function openSecret(blob: string, aad: string, raw?: string): string {
  const [v, iv, tag, ct] = blob.split(":");
  if (v !== "s1" || !iv || !tag || !ct) throw new Error("Unreadable stored secret");
  const d = createDecipheriv("aes-256-gcm", deriveKey("settings", raw), Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(aad, "utf8"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
