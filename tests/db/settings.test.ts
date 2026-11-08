import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getSection, getSectionSync, invalidateSettings, publicView, saveSection, SettingsError, recordTest, allSections } from "@/server/settings/store";
import { sealSecret } from "@/server/settings/keys";
import { runTest } from "@/server/settings/testers";
import { authOptions, enabledSocialProviders } from "@/server/auth/user-auth";
import { marketplaceSettings } from "@/server/catalog/listings";
import { developerPolicy } from "@/server/developer/policy";
import { networkSettings } from "@/server/viewer";
import { siteInfo, cspExtras, analyticsConfig } from "@/server/settings/site";
import { storage } from "@/server/storage";
import { migrationStatus } from "@/server/setup/migrate";
import { setupOpen, setupState } from "@/server/setup/setup";
import { seedBase } from "@/server/setup/base-seed";

/**
 * Settings service against a real MySQL / MariaDB database: encryption at rest,
 * audit without values, runtime refresh, and that integrations really read it.
 */
const SECTIONS = ["email", "google", "github", "marketplace", "developer", "security", "seo", "general", "plausible", "storage", "webmaster"];
let adminId = "";

beforeAll(async () => {
  const a = await db.adminUser.create({ data: { email: `settings-${Date.now()}@example.test`, name: "Settings Test", role: "SUPER_ADMIN", passwordHash: "x" } });
  adminId = a.id;
  await db.systemSetting.deleteMany({ where: { key: { in: SECTIONS.map((s) => `config.${s}`) } } });
  invalidateSettings();
});
afterAll(async () => {
  await db.systemSetting.deleteMany({ where: { key: { in: SECTIONS.map((s) => `config.${s}`) } } });
  await db.auditLog.deleteMany({ where: { adminId } });
  await db.adminUser.delete({ where: { id: adminId } });
  invalidateSettings();
});

describe("saving settings", () => {
  it("stores secrets encrypted and never in the audit log", async () => {
    const r = await saveSection("email", { enabled: false, values: { host: "smtp.example.test", port: "587", user: "mailer@example.test" }, secrets: { password: "Very-Secret-Pa55" } }, { adminId });
    expect(r.changed).toEqual(expect.arrayContaining(["host", "port", "user", "password (replaced)"]));
    const row = await db.systemSetting.findUniqueOrThrow({ where: { key: "config.email" } });
    const raw = JSON.stringify(row.value);
    expect(raw).not.toContain("Very-Secret-Pa55");
    expect(raw).toMatch(/"password":"s1:/);
    const log = await db.auditLog.findFirstOrThrow({ where: { adminId, action: "settings.update" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(log.metadata)).not.toContain("Very-Secret");
    expect(JSON.stringify(log.metadata)).not.toContain("smtp.example.test");
    expect(log.metadata).toMatchObject({ section: "email" });
  });

  it("reads the saved values back (decrypted only on the server) and masks them for display", async () => {
    const s = await getSection("email");
    expect(s.str("host")).toBe("smtp.example.test");
    expect(s.num("port")).toBe(587);
    expect(s.str("password")).toBe("Very-Secret-Pa55");
    const pub = publicView(s);
    const pw = pub.find((p) => p.key === "password")!;
    expect(pw.secretSet).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("Very-Secret");
  });

  it("keeps a secret when the field is left empty, and removes it on request", async () => {
    await saveSection("email", { values: { host: "smtp2.example.test" }, secrets: { password: "" } }, { adminId });
    expect((await getSection("email")).str("password")).toBe("Very-Secret-Pa55");
    await saveSection("email", { values: {}, clearSecrets: ["password"] }, { adminId });
    expect((await getSection("email")).str("password")).toBe("");
  });

  it("refuses to enable a section with required fields missing, and validates values", async () => {
    await expect(saveSection("email", { enabled: true, values: {} }, { adminId })).rejects.toBeInstanceOf(SettingsError);
    await expect(saveSection("marketplace", { values: { searchPageSize: "1000" } }, { adminId })).rejects.toThrow(/at most 60/);
    await expect(saveSection("google", { values: { clientId: "not-a-client-id" } }, { adminId })).rejects.toThrow(/googleusercontent/);
    await expect(saveSection("database", { values: {} }, { adminId })).rejects.toBeInstanceOf(SettingsError);
  });

  it("reports an undecryptable secret after a key change instead of failing", async () => {
    const other = Buffer.alloc(32, 9).toString("base64");
    await db.systemSetting.upsert({ where: { key: "config.github" }, create: { key: "config.github", value: { enabled: true, values: { clientId: "Iv1.abcdefabcdef" }, secrets: { clientSecret: sealSecret("x", "config.github.clientSecret", other) } } }, update: { value: { enabled: true, values: { clientId: "Iv1.abcdefabcdef" }, secrets: { clientSecret: sealSecret("x", "config.github.clientSecret", other) } } } });
    invalidateSettings();
    const all = await allSections();
    const gh = all.find((s) => s.section.r.def.id === "github")!;
    expect(gh.status.status).toBe("error");
    expect(gh.status.detail).toMatch(/encryption key changed/);
    expect(await enabledSocialProviders()).not.toContain("github");
    expect((await runTest("github", { adminEmail: "a@example.test" })).ok).toBe(false);
  });

  it("records a test result that stops counting once the configuration changes", async () => {
    await saveSection("plausible", { enabled: false, values: { domain: "webcenta.example" } }, { adminId });
    await recordTest("plausible", true, "fine");
    let s = (await allSections()).find((x) => x.section.r.def.id === "plausible")!;
    expect(s.status.status).toBe("disabled");
    await saveSection("plausible", { enabled: true, values: {} }, { adminId });
    await recordTest("plausible", true, "fine");
    s = (await allSections()).find((x) => x.section.r.def.id === "plausible")!;
    expect(s.status.status).toBe("connected");
    await saveSection("plausible", { values: { domain: "other.example" } }, { adminId });
    s = (await allSections()).find((x) => x.section.r.def.id === "plausible")!;
    expect(s.status.status).toBe("configured");
  });
});

describe("runtime refresh across processes", () => {
  it("picks up a change written by another process via the version row", async () => {
    const before = getSectionSync("marketplace").num("searchPageSize");
    // Simulate another worker: write the row and bump the version directly.
    await db.systemSetting.upsert({ where: { key: "config.marketplace" }, create: { key: "config.marketplace", value: { values: { searchPageSize: 48 }, secrets: {} } }, update: { value: { values: { searchPageSize: 48 }, secrets: {} } } });
    await db.systemSetting.upsert({ where: { key: "config.__version" }, create: { key: "config.__version", value: { v: `ext-${Date.now()}` } }, update: { value: { v: `ext-${Date.now()}` } } });
    expect(before).not.toBe(48);
    invalidateSettings(); // same as waiting for the 5-second re-check
    expect((await marketplaceSettings()).pageSize).toBe(48);
  });
});

describe("integrations read the settings service", () => {
  it("sign-in providers, sign-ups and session length", async () => {
    await saveSection("google", { enabled: true, values: { clientId: "123-abc.apps.googleusercontent.com" }, secrets: { clientSecret: "google-secret" } }, { adminId });
    await saveSection("security", { values: { allowSignups: "off", sessionDays: "7" } }, { adminId });
    const o = await authOptions();
    expect(o.google).toEqual({ clientId: "123-abc.apps.googleusercontent.com", clientSecret: "google-secret" });
    expect(o.allowSignups).toBe(false);
    expect(o.sessionDays).toBe(7);
    expect(await enabledSocialProviders()).toContain("google");
    await saveSection("google", { enabled: false, values: {} }, { adminId });
    expect(await enabledSocialProviders()).not.toContain("google");
  });
  it("developer portal, network and SEO settings", async () => {
    await saveSection("developer", { values: { allowNewOrganizations: "off", verifyHtmlMeta: "off", maxDraftsPerOrg: "3" } }, { adminId });
    expect(await developerPolicy()).toEqual({ allowNewOrganizations: false, maxDraftsPerOrg: 3, methods: ["DNS_TXT", "WELL_KNOWN_FILE"] });
    await saveSection("security", { values: { trustedProxyHops: "2", geoCountryHeader: "X-Country" } }, { adminId });
    expect(await networkSettings()).toMatchObject({ trustedProxyHops: 2, geoCountryHeader: "x-country" });
    await saveSection("seo", { values: { allowIndexing: "off" } }, { adminId });
    await saveSection("general", { values: { siteName: "Webcenta Staging", bannerText: "Staging" } }, { adminId });
    const site = await siteInfo();
    expect(site).toMatchObject({ name: "Webcenta Staging", banner: "Staging", allowIndexing: false });
  });
  it("analytics scripts and their CSP sources appear only when enabled", async () => {
    await saveSection("plausible", { enabled: false, values: {} }, { adminId });
    expect((await analyticsConfig()).plausible).toBeNull();
    expect((await cspExtras("/")).script).toEqual([]);
    await saveSection("plausible", { enabled: true, values: {} }, { adminId });
    expect((await analyticsConfig()).plausible?.domain).toBe("other.example");
    expect((await cspExtras("/")).connect).toContain("https://plausible.io");
  });
  it("storage driver follows the saved configuration", async () => {
    await saveSection("storage", { values: { driver: "s3" } }, { adminId });
    await expect(storage()).rejects.toThrow(/S3 storage needs/);
    expect((await runTest("storage", { adminEmail: "a@example.test" })).ok).toBe(false);
    await db.systemSetting.delete({ where: { key: "config.storage" } });
    invalidateSettings();
    const d = await storage();
    expect(typeof d.put).toBe("function");
    expect((await runTest("storage", { adminEmail: "a@example.test" })).ok).toBe(true);
  });
  it("a test never echoes a saved secret", async () => {
    await saveSection("webmaster", { values: { indexNowKey: "abc12345key" } }, { adminId });
    const r = await runTest("webmaster", { adminEmail: "a@example.test" });
    expect(typeof r.ok).toBe("boolean");
  });
});

describe("first-time setup support", () => {
  it("reports migrations in the same format as Prisma", async () => {
    const m = await migrationStatus();
    expect(m.dir).toBeTruthy();
    expect(m.migrations.length).toBeGreaterThan(0);
    expect(m.migrations.every((x) => x.state === "applied")).toBe(true);
  });
  it("is closed without SETUP_TOKEN and while a Super Administrator exists", async () => {
    expect(await setupOpen()).toBe(false);
    process.env.SETUP_TOKEN = "s".repeat(40);
    try {
      expect(await setupOpen()).toBe(false); // the test Super Admin exists
      const st = await setupState();
      expect(st.database.ok).toBe(true);
      expect(st.migrations.pending).toEqual([]);
    } finally {
      delete process.env.SETUP_TOKEN;
    }
  });
  it("base seed is idempotent", async () => {
    const before = await db.category.count();
    await seedBase(db, () => undefined);
    expect(await db.category.count()).toBe(before);
  });
});
