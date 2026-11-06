import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { DomainVerificationMethod } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { analyzeHtml } from "@/server/scanner/html";
import { safeFetch } from "@/server/scanner/safe-fetch";
import { isBlockedHostname } from "@/server/scanner/net";
import { testModeAllowsLoopback } from "@/server/scanner/net";

export const WELL_KNOWN_PATH = "/.well-known/webcenter-verification.txt";
export const TXT_PREFIX = "webcenter-verification=";

export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(raw)) return null;
  if (isBlockedHostname(raw) && !(testModeAllowsLoopback() && raw.endsWith(".localhost"))) return null;
  return raw;
}

export async function startVerification(orgId: string, domainInput: string, method: DomainVerificationMethod) {
  const domain = normalizeDomain(domainInput);
  if (!domain) throw new Error("Enter a valid public domain name, e.g. example.com");
  const challenge = `wc-${randomBytes(18).toString("base64url")}`;
  return db.domainVerification.upsert({
    where: { orgId_domain: { orgId, domain } },
    create: { orgId, domain, method, challenge },
    update: { method, challenge, status: "PENDING", failureReason: null, verifiedAt: null },
  });
}

/** Checks the proof for a pending (or previously verified) domain. */
export async function checkVerification(id: string): Promise<{ ok: boolean; reason?: string }> {
  const v = await db.domainVerification.findUniqueOrThrow({ where: { id } });
  let ok = false, reason = "";
  try {
    if (v.method === "DNS_TXT") {
      const records = (await resolveTxt(v.domain)).map((r) => r.join(""));
      ok = records.includes(`${TXT_PREFIX}${v.challenge}`);
      if (!ok) reason = `TXT record "${TXT_PREFIX}${v.challenge}" not found on ${v.domain}`;
    } else {
      const url = v.method === "WELL_KNOWN_FILE" ? `https://${v.domain}${WELL_KNOWN_PATH}` : `https://${v.domain}/`;
      const res = await safeFetch(url);
      const finalHost = res.finalUrl ? new URL(res.finalUrl).hostname : "";
      if (!res.ok) reason = `Could not load ${url} (${res.error?.message ?? `HTTP ${res.status}`})`;
      else if (finalHost !== v.domain) reason = `The proof must be served by ${v.domain} itself (redirected to ${finalHost})`;
      else if (v.method === "WELL_KNOWN_FILE") ok = res.body.trim().split(/\s+/).includes(v.challenge);
      else ok = analyzeHtml(res.body).metaVerification.includes(v.challenge);
      if (!ok && !reason) reason = v.method === "WELL_KNOWN_FILE" ? "The verification file does not contain the code" : "The meta tag was not found on the homepage";
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
