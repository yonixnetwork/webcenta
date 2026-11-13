import { createHash, randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { DomainVerificationMethod } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { analyzeHtml } from "@/server/scanner/html";
import { safeFetch } from "@/server/scanner/safe-fetch";
import { isBlockedHostname } from "@/server/scanner/net";
import { testModeAllowsLoopback } from "@/server/scanner/net";

export const WELL_KNOWN_PATH = "/.well-known/webcenta-verification.txt";
export const TXT_PREFIX = "webcenta-verification=";
/** A pending code must be proven within this time; afterwards the developer requests a new one. */
export const CHALLENGE_TTL_DAYS = 14;

/** webcenta-domain-verification-<16 hex>.html — unique per verification code. */
export function htmlFileName(challenge: string): string {
  return `webcenta-domain-verification-${createHash("sha256").update(challenge).digest("hex").slice(0, 16)}.html`;
}

/** The exact content of the HTML verification file. */
export function htmlFileContent(challenge: string): string {
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Webcenta domain verification</title></head>\n<body>webcenta-domain-verification: ${challenge}</body></html>\n`;
}

/** DNS host label for a TXT record: "@" for the domain itself as most DNS panels expect. */
export function txtHostLabel(domain: string): { host: string; zone: string } {
  const parts = domain.split(".");
  // Without a public suffix list, assume the zone is the last two labels (or three for e.g. co.uk).
  const multi = /^(co|com|net|org|gov|ac|edu)\.[a-z]{2}$/.test(parts.slice(-2).join("."));
  const zoneLen = multi ? 3 : 2;
  const zone = parts.slice(-zoneLen).join(".");
  const sub = parts.slice(0, -zoneLen).join(".");
  return { host: sub || "@", zone };
}

export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(raw)) return null;
  // IP literals are never valid domains (the top-level label must contain a letter).
  if (!/[a-z]/.test(raw.split(".").pop() ?? "")) return null;
  if (isBlockedHostname(raw) && !(testModeAllowsLoopback() && raw.endsWith(".localhost"))) return null;
  return raw;
}

export async function startVerification(orgId: string, domainInput: string, method: DomainVerificationMethod) {
  const domain = normalizeDomain(domainInput);
  if (!domain) throw new Error("Enter a valid public domain name, e.g. example.com");
  // 144 bits from the system CSPRNG; unique per organisation, domain and request.
  const challenge = `wc-${randomBytes(18).toString("base64url")}`;
  const challengeExpiresAt = new Date(Date.now() + CHALLENGE_TTL_DAYS * 86_400_000);
  return db.domainVerification.upsert({
    where: { orgId_domain: { orgId, domain } },
    create: { orgId, domain, method, challenge, challengeExpiresAt },
    update: { method, challenge, challengeExpiresAt, status: "PENDING", failureReason: null, verifiedAt: null },
  });
}

/** Checks the proof for a pending (or previously verified) domain. */
export async function checkVerification(id: string): Promise<{ ok: boolean; reason?: string }> {
  const v = await db.domainVerification.findUniqueOrThrow({ where: { id } });
  let ok = false, reason = "";
  // An unproven code expires (a verified domain keeps being re-checked with its code).
  if (v.status !== "VERIFIED" && v.challengeExpiresAt && v.challengeExpiresAt < new Date()) {
    await db.domainVerification.update({ where: { id }, data: { status: "FAILED", lastCheckedAt: new Date(), failureReason: "This verification code has expired. Request a new code." } });
    return { ok: false, reason: "This verification code has expired. Request a new code and publish it instead." };
  }
  try {
    if (v.method === "DNS_TXT") {
      const records = (await resolveTxt(v.domain)).map((r) => r.join(""));
      ok = records.includes(`${TXT_PREFIX}${v.challenge}`);
      if (!ok) reason = `TXT record "${TXT_PREFIX}${v.challenge}" not found on ${v.domain} (found ${records.length} TXT record${records.length === 1 ? "" : "s"}). DNS changes can take up to a few hours to appear.`;
    } else {
      const url = v.method === "WELL_KNOWN_FILE" ? `https://${v.domain}${WELL_KNOWN_PATH}` : v.method === "HTML_FILE" ? `https://${v.domain}/${htmlFileName(v.challenge)}` : `https://${v.domain}/`;
      const res = await safeFetch(url);
      const finalHost = res.finalUrl ? new URL(res.finalUrl).hostname : "";
      if (!res.ok) reason = `Could not load ${url} (${res.error?.message ?? `HTTP ${res.status}`})`;
      else if (finalHost !== v.domain) reason = `The proof must be served by ${v.domain} itself (redirected to ${finalHost})`;
      else if (v.method === "WELL_KNOWN_FILE") ok = res.body.trim().split(/\s+/).includes(v.challenge);
      else if (v.method === "HTML_FILE") ok = res.body.includes(`webcenta-domain-verification: ${v.challenge}`);
      else ok = analyzeHtml(res.body).metaVerification.includes(v.challenge);
      if (!ok && !reason) reason = v.method === "WELL_KNOWN_FILE" ? "The verification file does not contain the code" : v.method === "HTML_FILE" ? `${url} loaded, but it does not contain this verification code. Upload the file exactly as provided.` : "The meta tag was not found on the homepage";
    }
  } catch (e) {
    reason = `Lookup failed: ${String(e instanceof Error ? e.message : e).slice(0, 200)}`;
  }
  const wasVerified = v.status === "VERIFIED";
  await db.domainVerification.update({
    where: { id },
    data: ok ? { status: "VERIFIED", verifiedAt: v.verifiedAt ?? new Date(), lastCheckedAt: new Date(), failureReason: null }
      : { status: wasVerified ? "LAPSED" : "FAILED", lastCheckedAt: new Date(), failureReason: reason },
  });
  if (ok) {
    const org = await db.developerOrg.findUniqueOrThrow({ where: { id: v.orgId } });
    if (org.verificationLevel === "UNVERIFIED") await db.developerOrg.update({ where: { id: org.id }, data: { verificationLevel: "DOMAIN_VERIFIED", verifiedAt: new Date() } });
  }
  return ok ? { ok } : { ok, reason };
}

export async function orgOwnsDomain(orgId: string, host: string) {
  const verified = await db.domainVerification.findMany({ where: { orgId, status: "VERIFIED" }, select: { domain: true } });
  return verified.some((v) => host === v.domain || host.endsWith(`.${v.domain}`));
}
