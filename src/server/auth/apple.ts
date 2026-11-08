import { createHash, createPrivateKey, createSign } from "node:crypto";

/**
 * Sign in with Apple client secret: an ES256 JWT signed with the private key
 * from Apple Developer → Keys (Sign in with Apple). Apple accepts at most six
 * months; we issue 150-day tokens and re-issue them daily (the iat is rounded
 * to the day so the auth instance is only rebuilt once a day).
 * https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
 */
export interface AppleKey { teamId: string; keyId: string; clientId: string; privateKey: string }

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function normalizeApplePrivateKey(pem: string): string {
  const t = pem.trim().replace(/\\n/g, "\n");
  return t.includes("BEGIN") ? t : `-----BEGIN PRIVATE KEY-----\n${t.replace(/\s+/g, "")}\n-----END PRIVATE KEY-----`;
}

/** Throws a readable error when the key is not an EC P-256 private key. */
export function validateApplePrivateKey(pem: string): string | null {
  try {
    const k = createPrivateKey(normalizeApplePrivateKey(pem));
    if (k.asymmetricKeyType !== "ec" || k.asymmetricKeyDetails?.namedCurve !== "prime256v1") return "This is not a Sign in with Apple key (an EC P-256 .p8 key is expected).";
    return null;
  } catch {
    return "The private key could not be read. Paste the full contents of the .p8 file.";
  }
}

/** ECDSA signatures are randomised: keep one token per key per day so it stays stable. */
const issued = new Map<string, { jwt: string; expiresAt: number }>();

export function appleClientSecret(k: AppleKey, now = Date.now()): { jwt: string; expiresAt: number } {
  const iat = Math.floor(now / 86_400_000) * 86_400; // start of the current UTC day
  const memo = createHash("sha256").update([k.teamId, k.keyId, k.clientId, k.privateKey, iat].join("\0")).digest("hex");
  const hit = issued.get(memo);
  if (hit) return hit;
  const exp = iat + 150 * 86_400;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: k.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: k.teamId, iat, exp, aud: "https://appleid.apple.com", sub: k.clientId }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key: createPrivateKey(normalizeApplePrivateKey(k.privateKey)), dsaEncoding: "ieee-p1363" });
  const result = { jwt: `${header}.${payload}.${b64url(sig)}`, expiresAt: exp * 1000 };
  if (issued.size > 20) issued.clear();
  issued.set(memo, result);
  return result;
}
