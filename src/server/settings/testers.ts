import { randomBytes } from "node:crypto";
import { createSmtpTransport, smtpConfig } from "@/server/email/send";
import { createDriver, storageConfig } from "@/server/storage";
import { getSection, missingFields, type Section } from "./store";
import { appleClientSecret } from "@/server/auth/apple";
import { sectionById } from "./registry";

/**
 * Real connection tests, one per testable section. Each uses the SAVED
 * configuration (save first, then test) and reports exactly what happened:
 * no test ever reports success without a positive answer from the service.
 * Secrets are never included in the result message.
 */
export interface TestResult { ok: boolean; message: string }
type Tester = (c: Section, ctx: { adminEmail: string }) => Promise<TestResult>;

const TIMEOUT = 12_000;
const get = (url: string, init: RequestInit = {}) => fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT) });
const form = (o: Record<string, string>) => new URLSearchParams(o);
const fail = (message: string): TestResult => ({ ok: false, message });
const pass = (message: string): TestResult => ({ ok: true, message });
const oneLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 200);

/**
 * OAuth providers: exchange a deliberately invalid authorization code. A
 * provider answers "invalid_grant"-style errors only after it has accepted the
 * client credentials, and "invalid_client" when they are wrong — so this checks
 * the ID and secret without signing anyone in.
 */
async function oauthProbe(url: string, body: URLSearchParams, headers: Record<string, string> = {}): Promise<{ status: number; error: string; description: string }> {
  const res = await get(url, { method: "POST", body, headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", ...headers } });
  const data = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
  return { status: res.status, error: String(data.error ?? ""), description: String(data.error_description ?? "") };
}

const callback = (provider: string) => `${(process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "")}/api/auth/callback/${provider}`;

const TESTERS: Record<string, Tester> = {
  async email(c, { adminEmail }) {
    const s = smtpConfig(c);
    const t = createSmtpTransport(s);
    try {
      await t.verify();
      const info = await t.sendMail({
        from: s.from, to: adminEmail, subject: "Webcenta SMTP test",
        text: `This is a test email from Admin → Settings → Email.\n\nServer: ${s.host}:${s.port}\nIf you received it, outgoing email works.`,
      });
      return pass(`Signed in to ${s.host}:${s.port} and sent a test email to ${adminEmail} (server reply: ${String(info.response ?? "accepted").slice(0, 80)}).`);
    } catch (e) {
      return fail(`SMTP failed: ${oneLine(e)}`);
    } finally {
      t.close();
    }
  },

  async google(c) {
    const r = await oauthProbe("https://oauth2.googleapis.com/token", form({ grant_type: "authorization_code", code: "webcenta-connection-test", redirect_uri: callback("google"), client_id: c.str("clientId"), client_secret: c.str("clientSecret") }));
    if (r.error === "invalid_grant") return pass(`Google accepted the client ID and secret. Authorised redirect URI must be ${callback("google")}.`);
    if (r.error === "invalid_client" || r.error === "unauthorized_client") return fail(`Google rejected the client ID or secret (${r.error}).`);
    if (r.error === "redirect_uri_mismatch") return fail(`Add ${callback("google")} to the OAuth client's authorised redirect URIs.`);
    return fail(`Unexpected answer from Google: HTTP ${r.status} ${r.error} ${r.description}`.trim());
  },

  async github(c) {
    const probe = async (id: string, secret: string, label: string): Promise<TestResult> => {
      const r = await oauthProbe("https://github.com/login/oauth/access_token", form({ client_id: id, client_secret: secret, code: "webcenta-connection-test" }));
      if (r.error === "bad_verification_code") return pass(`GitHub accepted the ${label} client ID and secret.`);
      if (r.error === "incorrect_client_credentials") return fail(`GitHub rejected the ${label} client ID or secret.`);
      return fail(`Unexpected answer from GitHub for the ${label} app: HTTP ${r.status} ${r.error} ${r.description}`.trim());
    };
    const main = await probe(c.str("clientId"), c.str("clientSecret"), "marketplace");
    if (!main.ok || !c.str("devClientId")) return main;
    if (!c.str("devClientSecret")) return fail("The developer-portal client ID is set but its secret is missing.");
    const dev = await probe(c.str("devClientId"), c.str("devClientSecret"), "developer-portal");
    return dev.ok ? pass(`${main.message} ${dev.message}`) : dev;
  },

  async microsoft(c) {
    const tenant = encodeURIComponent(c.str("tenantId") || "common");
    const r = await oauthProbe(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, form({ grant_type: "authorization_code", code: "webcenta-connection-test", redirect_uri: callback("microsoft"), client_id: c.str("clientId"), client_secret: c.str("clientSecret"), scope: "openid" }));
    const code = r.description.match(/AADSTS\d+/)?.[0] ?? "";
    if (r.error === "invalid_grant") return pass(`Microsoft accepted the application ID and secret (${code || "invalid test code"}). Redirect URI must be ${callback("microsoft")}.`);
    if (r.error === "invalid_client") return fail(`Microsoft rejected the client secret (${code}). Check that you copied the secret's value, not its ID, and that it has not expired.`);
    if (r.error === "unauthorized_client" || code === "AADSTS700016") return fail(`Microsoft does not know this application in tenant "${c.str("tenantId") || "common"}" (${code}).`);
    if (code === "AADSTS90002") return fail(`Tenant "${c.str("tenantId")}" was not found.`);
    return fail(`Unexpected answer from Microsoft: HTTP ${r.status} ${r.error} ${code}`.trim());
  },

  async apple(c) {
    // 1) The client secret: generated from the key (preferred) or the stored JWT; check its claims.
    let secret = c.str("clientSecret");
    if (c.str("privateKey") && c.str("teamId") && c.str("keyId")) {
      try {
        secret = appleClientSecret({ teamId: c.str("teamId"), keyId: c.str("keyId"), clientId: c.str("clientId"), privateKey: c.str("privateKey") }).jwt;
      } catch (e) {
        return fail(`The private key could not sign a client secret: ${oneLine(e)}`);
      }
    }
    const parts = secret.split(".");
    if (parts.length !== 3) return fail("The client secret is not a JWT (it should have three dot-separated parts).");
    let claims: { iss?: string; sub?: string; aud?: string; exp?: number };
    try {
      claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    } catch {
      return fail("The client secret's JWT payload cannot be decoded.");
    }
    if (claims.aud !== "https://appleid.apple.com") return fail(`The JWT audience must be https://appleid.apple.com (found ${String(claims.aud)}).`);
    if (claims.sub !== c.str("clientId")) return fail(`The JWT subject (${String(claims.sub)}) must equal the Services ID (${c.str("clientId")}).`);
    const days = claims.exp ? Math.floor((claims.exp * 1000 - Date.now()) / 86_400_000) : -1;
    if (days < 0) return fail("The client secret has expired. Generate a new one.");
    // 2) Ask Apple with an invalid code: invalid_grant means the client was accepted.
    const r = await oauthProbe("https://appleid.apple.com/auth/token", form({ grant_type: "authorization_code", code: "webcenta-connection-test", redirect_uri: callback("apple"), client_id: c.str("clientId"), client_secret: secret }));
    if (r.error === "invalid_grant") return pass(`Apple accepted the Services ID and client secret${c.str("privateKey") ? " (generated from your key and renewed automatically)" : `. The secret expires in ${days} day(s)`}.`);
    if (r.error === "invalid_client") return fail("Apple rejected the client (check the Team ID, Key ID, Services ID and signing key used for the JWT).");
    return fail(`Unexpected answer from Apple: HTTP ${r.status} ${r.error}`.trim());
  },

  async storage(c) {
    try {
      const d = createDriver(storageConfig(c));
      const key = `private/settings-test/${randomBytes(8).toString("hex")}.txt`;
      const body = new TextEncoder().encode(`webcenta storage test ${new Date().toISOString()}`);
      await d.put(key, body, "text/plain");
      const back = await d.get(key);
      await d.remove(key);
      if (!back || Buffer.compare(Buffer.from(back), Buffer.from(body)) !== 0) return fail("The test file was written but could not be read back.");
      return pass(c.str("driver") === "s3" ? `Wrote, read and deleted a test file in bucket "${c.str("s3Bucket")}".` : `Wrote, read and deleted a test file in ${c.str("localDir")}.`);
    } catch (e) {
      return fail(`Storage failed: ${oneLine(e)}`);
    }
  },

  async webrisk(c) {
    const q = new URLSearchParams({ uri: "https://www.google.com/", key: c.str("apiKey"), threatTypes: "MALWARE" });
    const res = await get(`https://webrisk.googleapis.com/v1/uris:search?${q}`);
    if (res.ok) return pass("Web Risk answered a lookup with your key.");
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
    return fail(`Web Risk refused the lookup: HTTP ${res.status} ${data.error?.status ?? ""} ${data.error?.message?.slice(0, 160) ?? ""}`.trim());
  },

  async urlhaus(c) {
    const res = await get("https://urlhaus-api.abuse.ch/v1/url/", { method: "POST", headers: { "Auth-Key": c.str("authKey"), "content-type": "application/x-www-form-urlencoded" }, body: form({ url: "https://www.google.com/" }) });
    if (res.status === 401 || res.status === 403) return fail("URLhaus rejected the Auth-Key.");
    const data = (await res.json().catch(() => ({}))) as { query_status?: string };
    if (res.ok && (data.query_status === "no_results" || data.query_status === "ok")) return pass("URLhaus answered a lookup with your Auth-Key.");
    return fail(`Unexpected answer from URLhaus: HTTP ${res.status} ${data.query_status ?? ""}`.trim());
  },

  async virustotal(c) {
    const key = c.str("apiKey");
    const res = await get(`https://www.virustotal.com/api/v3/users/${encodeURIComponent(key)}/overall_quotas`, { headers: { "x-apikey": key } });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { data?: { api_requests_daily?: { user?: { allowed?: number; used?: number } } } };
      const d = data.data?.api_requests_daily?.user;
      return pass(`VirusTotal accepted the key${d ? ` (daily quota: ${d.used ?? 0} of ${d.allowed ?? "?"} used)` : ""}.`);
    }
    return fail(res.status === 401 ? "VirusTotal rejected the API key." : `Unexpected answer from VirusTotal: HTTP ${res.status}`);
  },

  async plausible(c) {
    const url = c.str("scriptUrl") || "https://plausible.io/js/script.js";
    const res = await get(url);
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && /javascript/.test(type)) return pass(`The script responds (${url}). Visits appear in Plausible for "${c.str("domain")}" once the site is live.`);
    return fail(`The script address answered HTTP ${res.status} ${type}`.trim());
  },

  async stripe(c) {
    const sk = c.str("secretKey");
    const pkMode = c.str("publishableKey").startsWith("pk_live_") ? "live" : "test";
    const skMode = /_live_/.test(sk) ? "live" : "test";
    if (pkMode !== skMode) return fail(`The publishable key is a ${pkMode} key but the secret key is a ${skMode} key.`);
    const res = await get("https://api.stripe.com/v1/balance", { headers: { authorization: `Bearer ${sk}` } });
    if (res.ok) return pass(`Stripe accepted the secret key (${skMode} mode). No charge was made.`);
    const data = (await res.json().catch(() => ({}))) as { error?: { type?: string; code?: string } };
    return fail(res.status === 401 ? "Stripe rejected the secret key." : `Stripe answered HTTP ${res.status} ${data.error?.code ?? data.error?.type ?? ""}`.trim());
  },

  async paypal(c) {
    const host = c.str("mode") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    const basic = Buffer.from(`${c.str("clientId")}:${c.str("clientSecret")}`).toString("base64");
    const res = await get(`${host}/v1/oauth2/token`, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: form({ grant_type: "client_credentials" }) });
    if (res.ok) return pass(`PayPal (${c.str("mode") || "sandbox"}) issued an access token for these credentials. No payment was made.`);
    return fail(res.status === 401 ? `PayPal (${c.str("mode") || "sandbox"}) rejected the client ID or secret.` : `PayPal answered HTTP ${res.status}`);
  },

  async webmaster(c) {
    const key = c.str("indexNowKey");
    if (!key) return fail("No IndexNow key is set.");
    const base = (process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
    if (!base) return fail("PUBLIC_ORIGIN is not set.");
    try {
      const res = await get(`${base}/indexnow-key.txt`);
      const text = (await res.text()).trim();
      if (res.ok && text === key) return pass(`${base}/indexnow-key.txt serves the key.`);
      return fail(`${base}/indexnow-key.txt answered HTTP ${res.status}${res.ok ? " with a different value" : ""}.`);
    } catch (e) {
      return fail(`Could not reach ${base}/indexnow-key.txt from the server: ${oneLine(e)}`);
    }
  },
};

export function hasTester(id: string): boolean {
  return Boolean(TESTERS[id]) && Boolean(sectionById(id)?.testable);
}

/** Runs the test for a section with its saved configuration. */
export async function runTest(id: string, ctx: { adminEmail: string }): Promise<TestResult> {
  const t = TESTERS[id];
  if (!t || !sectionById(id)?.testable) return fail("This section has no connection test.");
  const c = await getSection(id);
  if (c.r.unreadable.length) return fail("A saved secret can no longer be decrypted (the encryption key changed). Enter it again and save.");
  const missing = missingFields(c.r);
  if (missing.length) return fail(`Save these first: ${missing.map((k) => c.r.def.fields.find((f) => f.key === k)?.label ?? k).join(", ")}.`);
  let r: TestResult;
  try {
    r = await t(c, ctx);
  } catch (e) {
    r = fail(`The test could not complete: ${oneLine(e)}`);
  }
  // Never echo a secret back, even if a provider's error message contains it.
  for (const f of c.r.def.fields) {
    const v = f.type === "secret" ? c.str(f.key) : "";
    if (v.length >= 4) r = { ...r, message: r.message.split(v).join("••••") };
  }
  return r;
}
