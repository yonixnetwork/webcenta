import { describe, expect, it } from "vitest";
import { deriveKey, derivedSecret, masterKey, openSecret, sealSecret } from "@/server/settings/keys";
import { GROUPS, SECTIONS, sectionById } from "@/server/settings/registry";
import { __test, maskSecret, missingFields, Section, statusOf, fingerprint } from "@/server/settings/store";
import { buildCsp, originsFromEnv } from "@/lib/hosts";
import { checkSetupToken, setupAttemptAllowed, setupTokenConfigured } from "@/server/setup/setup";
import { STARTUP_VARS } from "@/server/settings/startup";
import { isAdPage } from "@/server/settings/site";
import { can } from "@/server/admin/permissions";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");
const { resolve, asStored, parseField } = __test;

describe("settings encryption", () => {
  it("round-trips with the same key and field", () => {
    const blob = sealSecret("p@ss word", "config.email.password", KEY_A);
    expect(blob).toMatch(/^s1:/);
    expect(blob).not.toContain("p@ss");
    expect(openSecret(blob, "config.email.password", KEY_A)).toBe("p@ss word");
  });
  it("uses a fresh IV every time", () => {
    expect(sealSecret("x", "a", KEY_A)).not.toBe(sealSecret("x", "a", KEY_A));
  });
  it("refuses another field (AAD), another key, or tampering", () => {
    const blob = sealSecret("secret", "config.google.clientSecret", KEY_A);
    expect(() => openSecret(blob, "config.github.clientSecret", KEY_A)).toThrow();
    expect(() => openSecret(blob, "config.google.clientSecret", KEY_B)).toThrow();
    const parts = blob.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => openSecret(parts.join(":"), "config.google.clientSecret", KEY_A)).toThrow();
    expect(() => openSecret("garbage", "x", KEY_A)).toThrow(/Unreadable/);
  });
  it("derives independent keys per purpose", () => {
    expect(deriveKey("settings", KEY_A).equals(deriveKey("user-auth", KEY_A))).toBe(false);
    expect(derivedSecret("user-auth", KEY_A)).toHaveLength(43);
    expect(derivedSecret("user-auth", KEY_A)).toBe(derivedSecret("user-auth", KEY_A));
  });
  it("requires the master key in production only", () => {
    expect(() => masterKey("", "production")).toThrow(/FIELD_ENCRYPTION_KEY/);
    expect(masterKey("", "development")).toHaveLength(32);
    expect(masterKey(KEY_A, "production").equals(Buffer.alloc(32, 1))).toBe(true);
  });
});

describe("settings registry", () => {
  it("has unique section ids, unique field keys and valid permissions", () => {
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    for (const s of SECTIONS) {
      expect(new Set(s.fields.map((f) => f.key)).size, s.id).toBe(s.fields.length);
      expect(["settings.manage", "integrations.manage"]).toContain(s.permission);
      for (const f of s.fields) {
        if (f.pattern) expect(() => new RegExp(f.pattern!.source)).not.toThrow();
        if (f.when) expect(s.fields.some((o) => o.key === f.when!.key)).toBe(true);
        if (f.type === "select") expect(f.options?.length).toBeGreaterThan(0);
      }
    }
    expect(GROUPS.length).toBeGreaterThan(5);
  });
  it("puts every section holding a secret behind integrations.manage, except none", () => {
    for (const s of SECTIONS.filter((x) => x.fields.some((f) => f.type === "secret"))) expect(s.permission, s.id).toBe("integrations.manage");
  });
  it("only Super Administrators manage integrations", () => {
    expect(can("SUPER_ADMIN", "integrations.manage")).toBe(true);
    expect(can("ADMIN", "integrations.manage")).toBe(false);
    expect(can("ADMIN", "settings.manage")).toBe(true);
    expect(can("MODERATOR", "settings.manage")).toBe(false);
  });
});

describe("settings resolution", () => {
  const email = sectionById("email")!;
  it("prefers saved values, then the environment, then defaults", () => {
    const env = { SMTP_HOST: "env.example", SMTP_PORT: "587", EMAIL_TRANSPORT: "smtp" };
    const r = resolve(email, asStored({ values: { host: "saved.example" } }), env);
    expect(r.values.host).toBe("saved.example");
    expect(r.sources.host).toBe("saved");
    expect(r.values.port).toBe(587);
    expect(r.sources.port).toBe("env");
    expect(r.values.from).toBe("Webcenta <noreply@webcenta.com>");
    expect(r.sources.from).toBe("default");
    expect(r.enabled).toBe(true); // envEnabled: EMAIL_TRANSPORT=smtp
  });
  it("a saved switch overrides the environment", () => {
    expect(resolve(email, asStored({ enabled: false }), { EMAIL_TRANSPORT: "smtp" }).enabled).toBe(false);
    expect(resolve(email, undefined, {}).enabled).toBe(false);
  });
  it("decrypts saved secrets and reports undecryptable ones", () => {
    const secret = sealSecret("pw", "config.email.password");
    const ok = resolve(email, asStored({ secrets: { password: secret } }), {});
    expect(ok.values.password).toBe("pw");
    const bad = resolve(email, asStored({ secrets: { password: sealSecret("pw", "config.email.password", KEY_B) } }), {});
    expect(bad.values.password).toBeUndefined();
    expect(bad.unreadable).toEqual(["password"]);
    expect(statusOf(bad).status).toBe("disabled");
  });
  it("computes status: disabled, missing, configured, connected, error", () => {
    const base = { enabled: true, values: { host: "h", user: "u" }, secrets: {} as Record<string, string> };
    expect(statusOf(resolve(email, asStored({ ...base, enabled: false }), {})).status).toBe("disabled");
    const missing = resolve(email, asStored(base), {});
    expect(statusOf(missing).status).toBe("missing");
    expect(missingFields(missing)).toEqual(["password"]);
    const full = asStored({ ...base, secrets: { password: sealSecret("pw", "config.email.password") } });
    const r = resolve(email, full, {});
    expect(statusOf(r).status).toBe("configured");
    const fp = fingerprint(r);
    expect(statusOf(resolve(email, { ...full, test: { ok: true, message: "ok", at: "", fingerprint: fp } }, {})).status).toBe("connected");
    expect(statusOf(resolve(email, { ...full, test: { ok: false, message: "bad", at: "", fingerprint: fp } }, {})).status).toBe("error");
    // A test result for an older configuration no longer counts.
    const changed = { ...full, values: { ...full.values, host: "other" }, test: { ok: true, message: "ok", at: "", fingerprint: fp } };
    expect(statusOf(resolve(email, changed, {})).status).toBe("configured");
  });
  it("ignores fields hidden by a condition when checking required values", () => {
    const storage = sectionById("storage")!;
    expect(missingFields(resolve(storage, undefined, {}))).toEqual([]);
  });
  it("exposes typed accessors", () => {
    const s = new Section(resolve(sectionById("marketplace")!, asStored({ values: { searchPageSize: 30 } }), {}));
    expect(s.num("searchPageSize")).toBe(30);
    expect(s.num("highlyRatedMinRatings")).toBe(5);
    expect(s.str("missing")).toBe("");
    expect(s.ready).toBe(true);
  });
});

describe("settings validation", () => {
  const f = (section: string, key: string) => sectionById(section)!.fields.find((x) => x.key === key)!;
  it("validates numbers, patterns, selects, colours and URLs", () => {
    expect(parseField(f("marketplace", "searchPageSize"), "30")).toBe(30);
    expect(() => parseField(f("marketplace", "searchPageSize"), "5")).toThrow(/at least 12/);
    expect(() => parseField(f("marketplace", "searchPageSize"), "abc")).toThrow(/number/);
    expect(() => parseField(f("google", "clientId"), "nope")).toThrow(/googleusercontent/);
    expect(parseField(f("google", "clientId"), "123-abc.apps.googleusercontent.com")).toBe("123-abc.apps.googleusercontent.com");
    expect(() => parseField(f("storage", "driver"), "ftp")).toThrow(/options/);
    expect(() => parseField(f("pwa", "themeColor"), "red")).toThrow(/colour/);
    expect(() => parseField(f("seo", "ogImageUrl"), "javascript:alert(1)")).toThrow();
    expect(parseField(f("seo", "allowIndexing"), "off")).toBe(false);
  });
});

describe("secret masking", () => {
  it("never reveals more than the last 4 characters of long secrets", () => {
    expect(maskSecret("sk_live_abcdefghijklmnop1234")).toBe("••••••••1234");
    expect(maskSecret("short")).toBe("••••••••");
    expect(maskSecret("a-very-long-mailbox-password-1234", false)).toBe("••••••••");
  });
});

describe("origins and CSP additions", () => {
  it("derives admin and developer origins from PUBLIC_ORIGIN", () => {
    expect(originsFromEnv({ PUBLIC_ORIGIN: "https://webcenta.com" })).toEqual({ publicOrigin: "https://webcenta.com", adminOrigin: "https://admin.webcenta.com", developerOrigin: "https://developers.webcenta.com" });
    expect(originsFromEnv({ PUBLIC_ORIGIN: "https://webcenta.com", ADMIN_ORIGIN: "https://ops.example.com/" }).adminOrigin).toBe("https://ops.example.com");
    expect(originsFromEnv({}).adminOrigin).toBe("http://admin.localhost:3000");
  });
  it("adds only https sources and never weakens the base policy", () => {
    const csp = buildCsp("n", false, undefined, false, { script: ["https://plausible.io", "'unsafe-inline'", "http://evil.example", "https://x.example; script-src *"], connect: ["https://*.google-analytics.com"], frame: ["https://www.google.com"] });
    expect(csp).toContain("script-src 'self' 'nonce-n' 'strict-dynamic' https://plausible.io;");
    expect(csp.split("; ").find((d) => d.startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(csp).not.toContain("evil");
    expect(csp).not.toContain("script-src *");
    expect(csp).toContain("connect-src 'self' https://*.google-analytics.com;");
    expect(csp).toContain("frame-src 'self' https://www.google.com;");
    expect(buildCsp("n", false)).not.toContain("frame-src");
  });
  it("keeps ads off app, account, developer and leaving pages", () => {
    for (const p of ["/", "/search", "/categories", "/c/ai"]) expect(isAdPage(p)).toBe(true);
    for (const p of ["/app/x", "/go/x", "/account", "/developer", "/signin", "/c/ai/extra"]) expect(isAdPage(p)).toBe(false);
  });
});

describe("first-time setup gate", () => {
  const token = "t".repeat(40);
  it("requires a token of at least 32 characters", () => {
    expect(setupTokenConfigured({})).toBe(false);
    expect(setupTokenConfigured({ SETUP_TOKEN: "short" })).toBe(false);
    expect(setupTokenConfigured({ SETUP_TOKEN: token })).toBe(true);
  });
  it("compares tokens exactly", () => {
    expect(checkSetupToken(token, { SETUP_TOKEN: token })).toBe(true);
    expect(checkSetupToken(token + "x", { SETUP_TOKEN: token })).toBe(false);
    expect(checkSetupToken("", { SETUP_TOKEN: token })).toBe(false);
    expect(checkSetupToken("short", { SETUP_TOKEN: "short" })).toBe(false);
  });
  it("rate-limits attempts", () => {
    const key = `test-${Math.random()}`;
    const results = Array.from({ length: 4 }, () => setupAttemptAllowed(key, 3, 60_000));
    expect(results).toEqual([true, true, true, false]);
  });
});

describe("startup variables", () => {
  it("keeps the required list minimal", () => {
    expect(STARTUP_VARS.filter((v) => v.required !== "optional").map((v) => v.name)).toEqual(["DATABASE_URL", "FIELD_ENCRYPTION_KEY", "PUBLIC_ORIGIN", "NODE_ENV"]);
  });
});
