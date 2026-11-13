import { resolveNs } from "node:dns/promises";
import { stringArray } from "@/lib/json-arrays";
import type { Prisma } from "@/generated/prisma/client";
import type { AlertSeverity, CheckType, ScanTrigger } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { analyzeHtml } from "./html";
import { blocklistCheck, cloudflareSecurityDns, domainRegistered, googleWebRisk, urlhaus, virusTotal, type Verdict } from "./providers";
import { parseSiteHtml } from "@/server/importer/metadata";
import { safeFetch, type SafeResponse } from "./safe-fetch";
import { brandLabel, levenshtein, PROTECTED_BRANDS, registrableDomain, skeleton } from "./domains";

export interface CheckOutcome { check: CheckType; provider: string; verdict: Verdict; summary: string; evidence?: Record<string, unknown>; severity?: AlertSeverity }

const ORDER: Verdict[] = ["SKIPPED", "PASS", "INCONCLUSIVE", "WARN", "FAIL"];
export const worst = (vs: Verdict[]): Verdict => vs.reduce<Verdict>((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "PASS");
const SEV: AlertSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const maxSeverity = (s: Array<AlertSeverity | undefined>) => s.filter(Boolean).reduce<AlertSeverity | null>((a, b) => (!a || SEV.indexOf(b!) > SEV.indexOf(a) ? b! : a), null);

async function nameservers(host: string): Promise<string[]> {
  try { return (await resolveNs(registrableDomain(host))).map((n) => n.toLowerCase()).sort(); } catch { return []; }
}

/** Runs every check against a URL. Pure with respect to listings (no status changes). */
export async function runChecks(target: { url: string; domain: string; privacyPolicyUrl?: string | null; termsUrl?: string | null; orgId?: string | null; previous?: PreviousScan | null; otherDomains?: string[] }) {
  const checks: CheckOutcome[] = [];
  const res: SafeResponse = await safeFetch(target.url);
  const page = analyzeHtml(res.body);
  const listedReg = registrableDomain(target.domain);
  const finalHost = (() => { try { return new URL(res.finalUrl).hostname.toLowerCase(); } catch { return ""; } })();
  const hopHosts = [...new Set(res.chain.map((h) => { try { return new URL(h.url).hostname.toLowerCase(); } catch { return ""; } }).filter(Boolean))];

  // DNS
  if (res.error?.code === "BLOCKED_ADDRESS" || res.error?.code === "BLOCKED_HOST") {
    checks.push({ check: "DNS_RESOLUTION", provider: "internal", verdict: "FAIL", summary: "Resolves to a private/reserved address or forbidden host", evidence: { error: res.error }, severity: "HIGH" });
  } else if (res.error?.code === "DNS_FAILED" && res.chain.length <= 1) {
    checks.push({ check: "DNS_RESOLUTION", provider: "internal", verdict: "FAIL", summary: "Domain does not resolve", severity: "MEDIUM" });
  } else {
    checks.push({ check: "DNS_RESOLUTION", provider: "internal", verdict: "PASS", summary: `Resolves to ${res.ips.length} public address(es)`, evidence: { ips: res.ips } });
  }

  // HTTP reachability
  if (res.ok) checks.push({ check: "HTTP_REACHABILITY", provider: "internal", verdict: "PASS", summary: `HTTP ${res.status} in ${res.durationMs} ms` });
  else if (res.status >= 400) checks.push({ check: "HTTP_REACHABILITY", provider: "internal", verdict: res.status >= 500 ? "FAIL" : "WARN", summary: `Website returned HTTP ${res.status}`, severity: "MEDIUM" });
  else checks.push({ check: "HTTP_REACHABILITY", provider: "internal", verdict: "FAIL", summary: `Unreachable: ${res.error?.message ?? "unknown error"}`, evidence: { error: res.error }, severity: "MEDIUM" });

  // Redirects
  const offDomain = hopHosts.filter((h) => registrableDomain(h) !== listedReg);
  const ipHop = res.chain.slice(1).some((h) => { try { return /^\d+\.\d+\.\d+\.\d+$|^\[/.test(new URL(h.url).hostname); } catch { return false; } });
  if (res.error?.code === "TOO_MANY_REDIRECTS") checks.push({ check: "REDIRECT_CHAIN", provider: "internal", verdict: "FAIL", summary: "Redirect loop or too many redirects", evidence: { chain: res.chain }, severity: "MEDIUM" });
  else if ((res.error?.code === "BLOCKED_ADDRESS" || res.error?.code === "BLOCKED_HOST") && res.chain.length > 1) checks.push({ check: "REDIRECT_CHAIN", provider: "internal", verdict: "FAIL", summary: "Redirects into a private network address", evidence: { chain: res.chain }, severity: "HIGH" });
  else if (ipHop) checks.push({ check: "REDIRECT_CHAIN", provider: "internal", verdict: "FAIL", summary: "Redirects to a raw IP address", evidence: { chain: res.chain }, severity: "HIGH" });
  else if (offDomain.length) checks.push({ check: "REDIRECT_CHAIN", provider: "internal", verdict: "WARN", summary: `Redirects away from ${listedReg} to ${offDomain.join(", ")}`, evidence: { chain: res.chain }, severity: "MEDIUM" });
  else checks.push({ check: "REDIRECT_CHAIN", provider: "internal", verdict: "PASS", summary: res.chain.length > 1 ? `${res.chain.length - 1} same-site redirect(s)` : "No redirects", evidence: { chain: res.chain } });

  // TLS
  const usesHttps = res.finalUrl.startsWith("https://");
  if (!usesHttps && res.ok) checks.push({ check: "TLS_CERTIFICATE", provider: "internal", verdict: "FAIL", summary: "Final page is not served over HTTPS", severity: "MEDIUM" });
  else if (res.tls && !res.tls.authorized) checks.push({ check: "TLS_CERTIFICATE", provider: "internal", verdict: "FAIL", summary: `Invalid TLS certificate (${res.tls.error ?? "untrusted"})`, severity: "MEDIUM" });
  else if (res.tls?.validTo) {
    const days = Math.floor((res.tls.validTo.getTime() - Date.now()) / 86_400_000);
    checks.push({ check: "TLS_CERTIFICATE", provider: "internal", verdict: days < 0 ? "FAIL" : days < 14 ? "WARN" : "PASS", summary: days < 0 ? "Certificate expired" : `Valid for ${days} more days (${res.tls.issuer ?? "unknown issuer"})`, severity: days < 0 ? "MEDIUM" : "LOW" });
  } else checks.push({ check: "TLS_CERTIFICATE", provider: "internal", verdict: "INCONCLUSIVE", summary: "No certificate information" });

  // Threat intelligence (all hosts in the chain)
  const hostsToCheck = [...new Set([target.domain, ...hopHosts])];
  // Paid providers (Web Risk, VirusTotal) report SKIPPED while they are switched off.
  const intel = await Promise.all([blocklistCheck(hostsToCheck), googleWebRisk(res.finalUrl || target.url), urlhaus(target.url), virusTotal(target.url), ...[...new Set([target.domain, finalHost].filter(Boolean))].map((h) => cloudflareSecurityDns(h))]);
  for (const r of intel) {
    if (r.verdict === "SKIPPED" && (r.provider === "google-web-risk" || r.provider === "virustotal")) continue;
    const domainLevel = r.provider === "webcenta-blocklist" || r.provider === "cloudflare-security-dns";
    checks.push({ check: domainLevel ? "THREAT_INTEL_DOMAIN" : "THREAT_INTEL_URL", provider: r.provider, verdict: r.verdict, summary: r.summary, evidence: r.evidence, severity: r.verdict === "FAIL" ? "CRITICAL" : r.verdict === "WARN" ? "HIGH" : undefined });
  }

  // Domain age (public RDAP). Very new domains are a common sign of scams.
  const registered = await domainRegistered(target.domain);
  if (registered) {
    const days = Math.floor((Date.now() - registered.getTime()) / 86_400_000);
    checks.push({ check: "DOMAIN_AGE", provider: "rdap", verdict: days < 30 ? "WARN" : "PASS", summary: days < 30 ? `Domain registered only ${days} day(s) ago` : `Domain registered ${Math.floor(days / 365)} year(s) ago (${registered.toISOString().slice(0, 10)})`, evidence: { registered: registered.toISOString() }, severity: days < 30 ? "MEDIUM" : undefined });
  } else checks.push({ check: "DOMAIN_AGE", provider: "rdap", verdict: "SKIPPED", summary: "Registration date not available from RDAP" });

  // Phishing heuristics
  const pageText = `${page.title ?? ""} ${page.text}`.toLowerCase();
  const foreignPasswordForm = page.passwordForms.some((f) => {
    if (!f.action || f.action.startsWith("/") || f.action.startsWith("#")) return false;
    try { return registrableDomain(new URL(f.action, res.finalUrl).hostname) !== registrableDomain(finalHost || target.domain); } catch { return false; }
  });
  const ownBrand = brandLabel(target.domain);
  const brandClaims = PROTECTED_BRANDS.filter((b) => b !== ownBrand && new RegExp(`\\b${b}\\b`).test(pageText));
  if (page.asksForSeedPhrase) checks.push({ check: "PHISHING_HEURISTICS", provider: "internal", verdict: "FAIL", summary: "Page asks visitors to enter a wallet seed/recovery phrase or private key", severity: "HIGH" });
  else if (foreignPasswordForm) checks.push({ check: "PHISHING_HEURISTICS", provider: "internal", verdict: "FAIL", summary: "Password form submits to a different domain", severity: "HIGH" });
  else if (page.passwordForms.length && brandClaims.length && /(verify your account|account (?:suspended|locked)|confirm your identity|unusual activity)/.test(pageText)) {
    checks.push({ check: "PHISHING_HEURISTICS", provider: "internal", verdict: "WARN", summary: `Login page referencing ${brandClaims.join(", ")} with account-warning language`, severity: "HIGH" });
  } else checks.push({ check: "PHISHING_HEURISTICS", provider: "internal", verdict: res.body ? "PASS" : "INCONCLUSIVE", summary: res.body ? "No phishing indicators found" : "No page content to analyse" });

  // Impersonation (domain look-alikes)
  const label = brandLabel(target.domain);
  const sk = skeleton(label);
  const lookalikeBrand = PROTECTED_BRANDS.find((b) => b !== label && (sk === b || (b.length >= 5 && levenshtein(sk, b) <= 1) || (sk.includes(b) && sk !== b)));
  const lookalikeListed = (target.otherDomains ?? []).find((d) => { const o = brandLabel(d); return o !== label && o.length >= 5 && levenshtein(skeleton(o), sk) <= 1; });
  if (target.domain.includes("xn--") || lookalikeBrand || lookalikeListed) {
    checks.push({ check: "IMPERSONATION", provider: "internal", verdict: "WARN", summary: `Domain resembles ${lookalikeBrand ?? lookalikeListed ?? "an internationalised look-alike"}`, severity: "MEDIUM" });
  } else checks.push({ check: "IMPERSONATION", provider: "internal", verdict: "PASS", summary: "No look-alike domain detected" });

  // Downloads
  const disp = res.headers["content-disposition"] ?? "";
  const ctype = res.headers["content-type"] ?? "";
  if (/attachment/i.test(disp) || /application\/(x-msdownload|x-msdos-program|vnd\.android\.package-archive|x-sh|x-executable|octet-stream)/i.test(ctype)) {
    checks.push({ check: "DOWNLOAD_BEHAVIOUR", provider: "internal", verdict: "FAIL", summary: `Homepage triggers a file download (${ctype || disp})`, severity: "HIGH" });
  } else checks.push({ check: "DOWNLOAD_BEHAVIOUR", provider: "internal", verdict: "PASS", summary: "No automatic download" });

  // Policy pages: given ones, or the links on the homepage. A real privacy policy is reachable,
  // is substantial, talks about privacy/personal data and names this website.
  const found = analyzeLinks(res.body, res.finalUrl || target.url);
  const privacyUrl = target.privacyPolicyUrl ?? found.privacy;
  const termsUrl = target.termsUrl ?? found.terms;
  if (privacyUrl || termsUrl) {
    const urls = [privacyUrl, termsUrl].filter(Boolean) as string[];
    const results = await Promise.all(urls.map((u) => safeFetch(u)));
    const bad = results.filter((r) => !r.ok);
    checks.push({ check: "POLICY_PAGES", provider: "internal", verdict: bad.length ? "WARN" : "PASS", summary: bad.length ? `${bad.length} policy page(s) unreachable` : `Policy pages reachable${!target.privacyPolicyUrl && found.privacy ? " (found on the homepage)" : ""}`, severity: "LOW" });
    const priv = privacyUrl ? results[0] : null;
    if (priv?.ok) {
      const text = analyzeHtml(priv.body).text.toLowerCase();
      const host = (() => { try { return new URL(priv.finalUrl).hostname.toLowerCase(); } catch { return ""; } })();
      const sameSite = registrableDomain(host) === listedReg || POLICY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
      const names = [listedReg, brandLabel(target.domain), ...(page.title ? [page.title.split(/[|–—:-]/)[0]!.trim().toLowerCase()] : [])].filter((x) => x.length >= 3);
      const namesSite = names.some((n) => text.includes(n.toLowerCase()));
      const isPolicy = /privacy|personal (data|information)|data protection/.test(text) && text.length > 800;
      const problems = [!sameSite && `hosted on ${host}`, !isPolicy && "does not read like a privacy policy", !namesSite && "does not mention this website"].filter(Boolean);
      checks.push({ check: "POLICY_CONTENT", provider: "internal", verdict: problems.length ? "WARN" : "PASS", summary: problems.length ? `Privacy policy ${problems.join(", ")}` : "Privacy policy belongs to this website", severity: problems.length ? "MEDIUM" : undefined });
    }
  } else checks.push({ check: "POLICY_PAGES", provider: "internal", verdict: "WARN", summary: "No privacy policy or terms found", severity: "LOW" });

  // Domain ownership
  if (target.orgId) {
    const verified = await db.domainVerification.findMany({ where: { orgId: target.orgId, status: "VERIFIED" }, select: { domain: true } });
    const ok = verified.some((v) => target.domain === v.domain || target.domain.endsWith(`.${v.domain}`));
    checks.push({ check: "DOMAIN_VERIFICATION", provider: "internal", verdict: ok ? "PASS" : "FAIL", summary: ok ? "Developer has verified ownership of this domain" : "Domain ownership is not (or no longer) verified", severity: "MEDIUM" });
  }

  // Change detection against the previous completed scan
  const ns = await nameservers(target.domain);
  const prev = target.previous;
  if (prev) {
    const prevFinal = prev.finalUrl ? registrableDomain(new URL(prev.finalUrl).hostname) : null;
    const nowFinal = finalHost ? registrableDomain(finalHost) : null;
    if (prevFinal && nowFinal && prevFinal !== nowFinal) checks.push({ check: "IDENTITY_CHANGE", provider: "internal", verdict: "WARN", summary: `Final destination changed from ${prevFinal} to ${nowFinal}`, severity: "HIGH" });
    else if (prev.pageTitle && page.title && prev.pageTitle !== page.title && levenshtein(prev.pageTitle.toLowerCase(), page.title.toLowerCase()) > Math.max(8, prev.pageTitle.length / 2)) {
      checks.push({ check: "IDENTITY_CHANGE", provider: "internal", verdict: "WARN", summary: `Site title changed from “${prev.pageTitle}” to “${page.title}”`, severity: "MEDIUM" });
    } else checks.push({ check: "IDENTITY_CHANGE", provider: "internal", verdict: "PASS", summary: "Site identity unchanged" });
    if (prev.contentHash && page.contentHash && prev.contentHash !== page.contentHash) checks.push({ check: "CONTENT_CHANGE", provider: "internal", verdict: "PASS", summary: "Page content changed since the last scan (informational)" });
    if (prev.nameservers.length && ns.length && prev.nameservers.join(",") !== ns.join(",")) checks.push({ check: "DNS_CHANGE", provider: "internal", verdict: "WARN", summary: `Nameservers changed (${prev.nameservers.join(", ")} → ${ns.join(", ")})`, severity: "MEDIUM" });
    if (prev.tlsFingerprint && res.tls?.fingerprint && prev.tlsIssuer && res.tls.issuer && prev.tlsIssuer !== res.tls.issuer) {
      checks.push({ check: "DNS_CHANGE", provider: "internal", verdict: "PASS", summary: `Certificate issuer changed (${prev.tlsIssuer} → ${res.tls.issuer}) (informational)` });
    }
  }
  return { res, page, checks, nameservers: ns };
}

/** Common hosted privacy-policy services (a policy hosted there still belongs to the site). */
const POLICY_HOSTS = ["termly.io", "iubenda.com", "termsfeed.com", "privacypolicies.com", "getterms.io", "notion.site", "google.com"];

/** Privacy policy and terms links on a page. */
function analyzeLinks(html: string, base: string): { privacy: string | null; terms: string | null } {
  if (!html) return { privacy: null, terms: null };
  const m = parseSiteHtml(html, base);
  return { privacy: m.privacyUrl, terms: m.termsUrl };
}

export interface PreviousScan { finalUrl: string | null; pageTitle: string | null; contentHash: string | null; nameservers: string[]; tlsFingerprint: string | null; tlsIssuer: string | null }

function riskScore(checks: CheckOutcome[]): number {
  const w: Record<string, number> = { CRITICAL: 60, HIGH: 35, MEDIUM: 15, LOW: 5 };
  let s = 0;
  for (const c of checks) if (c.verdict === "FAIL" || c.verdict === "WARN") s += (w[c.severity ?? "LOW"] ?? 5) * (c.verdict === "FAIL" ? 1 : 0.6);
  if (checks.some((c) => c.verdict === "INCONCLUSIVE")) s += 5;
  return Math.min(100, Math.round(s));
}

/** Runs a scan for a listing (or a revision's proposed URL) and stores it with its check results. */
export async function scanListing(listingId: string, trigger: ScanTrigger, opts: { revisionId?: string; adminId?: string } = {}) {
  const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  let target = { url: listing.websiteUrl, domain: listing.domain, privacyPolicyUrl: listing.privacyPolicyUrl, termsUrl: listing.termsUrl };
  if (opts.revisionId) {
    const rev = await db.listingRevision.findUniqueOrThrow({ where: { id: opts.revisionId } });
    const d = rev.data as { websiteUrl?: string; privacyPolicyUrl?: string | null; termsUrl?: string | null };
    if (d.websiteUrl) target = { url: d.websiteUrl, domain: new URL(d.websiteUrl).hostname.toLowerCase(), privacyPolicyUrl: d.privacyPolicyUrl ?? null, termsUrl: d.termsUrl ?? null };
  }
  const prevScan = await db.securityScan.findFirst({ where: { listingId, status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
  const otherDomains = (await db.listing.findMany({ where: { status: "PUBLISHED", id: { not: listingId } }, select: { domain: true }, take: 5000 })).map((l) => l.domain);
  const scan = await db.securityScan.create({ data: { listingId, revisionId: opts.revisionId ?? null, trigger, status: "RUNNING", targetUrl: target.url, startedAt: new Date(), requestedByAdminId: opts.adminId ?? null } });
  try {
    const { res, page, checks, nameservers } = await runChecks({ ...target, orgId: listing.developerId, previous: prevScan ? { ...prevScan, nameservers: stringArray(prevScan.nameservers) } : null, otherDomains });
    const overall = worst(checks.map((c) => c.verdict));
    const completed = await db.securityScan.update({
      where: { id: scan.id },
      data: {
        status: "COMPLETED", overallVerdict: overall, riskScore: riskScore(checks), finalUrl: res.finalUrl, httpStatus: res.status || null,
        redirectChain: res.chain as unknown as Prisma.InputJsonValue, resolvedIps: res.ips, nameservers, tlsIssuer: res.tls?.issuer ?? null,
        tlsValidTo: res.tls?.validTo ?? null, tlsFingerprint: res.tls?.fingerprint ?? null, pageTitle: page.title, contentHash: page.contentHash,
        bytesFetched: res.bytes, durationMs: res.durationMs, completedAt: new Date(),
        checks: { create: checks.map((c) => ({ check: c.check, provider: c.provider, verdict: c.verdict, summary: c.summary, evidence: (c.evidence ?? undefined) as Prisma.InputJsonValue | undefined })) },
      },
      include: { checks: true },
    });
    return { scan: completed, outcomes: checks };
  } catch (err) {
    await db.securityScan.update({ where: { id: scan.id }, data: { status: "FAILED", error: String(err).slice(0, 1000), completedAt: new Date() } });
    throw err;
  }
}

/**
 * True when every required check passed AND at least one external threat-intel
 * provider ran and passed (a THREAT_INTEL_URL PASS only comes from a configured provider).
 */
export function qualifiesForAutoApproval(outcomes: CheckOutcome[]): boolean {
  const relevant = outcomes.filter((o) => o.verdict !== "SKIPPED");
  // An external source must have looked at the site: URLhaus, or Cloudflare's malware filter.
  const externalPass = outcomes.some((o) => (o.check === "THREAT_INTEL_URL" || (o.check === "THREAT_INTEL_DOMAIN" && o.provider !== "webcenta-blocklist")) && o.verdict === "PASS");
  return externalPass && relevant.every((o) => o.verdict === "PASS");
}
