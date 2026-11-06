import { env } from "@/lib/env";
import { db } from "@/server/db";
import { registrableDomain } from "./domains";

/**
 * Threat-intelligence providers. Each returns PASS / FAIL / INCONCLUSIVE, or
 * SKIPPED when it is not configured. SKIPPED is never treated as PASS.
 */
export type Verdict = "PASS" | "WARN" | "FAIL" | "INCONCLUSIVE" | "SKIPPED";
export interface ProviderResult { provider: string; verdict: Verdict; summary: string; evidence?: Record<string, unknown> }

const TIMEOUT = 8000;
async function timed(input: string, init: RequestInit = {}) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
}

/** Admin-maintained blocklist (SystemSetting "security.domainBlocklist": string[]). */
export async function blocklistCheck(hosts: string[]): Promise<ProviderResult> {
  const row = await db.systemSetting.findUnique({ where: { key: "security.domainBlocklist" } });
  const list = new Set(((row?.value as string[] | undefined) ?? []).map((d) => d.toLowerCase()));
  const hits = hosts.filter((h) => list.has(h.toLowerCase()) || list.has(registrableDomain(h)));
  return hits.length
    ? { provider: "webcenter-blocklist", verdict: "FAIL", summary: `Listed on the WebCenter blocklist: ${hits.join(", ")}`, evidence: { hits } }
    : { provider: "webcenter-blocklist", verdict: "PASS", summary: "Not on the WebCenter blocklist" };
}

/** Google Web Risk (commercial terms). https://cloud.google.com/web-risk/docs/lookup-api */
export async function googleWebRisk(url: string): Promise<ProviderResult> {
  const key = env().GOOGLE_WEB_RISK_API_KEY;
  if (!key) return { provider: "google-web-risk", verdict: "SKIPPED", summary: "Not configured (GOOGLE_WEB_RISK_API_KEY)" };
  try {
    const q = new URLSearchParams({ uri: url, key });
    for (const t of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]) q.append("threatTypes", t);
    const res = await timed(`https://webrisk.googleapis.com/v1/uris:search?${q}`);
    if (!res.ok) return { provider: "google-web-risk", verdict: "INCONCLUSIVE", summary: `Provider error ${res.status}` };
    const data = (await res.json()) as { threat?: { threatTypes?: string[] } };
    return data.threat?.threatTypes?.length
      ? { provider: "google-web-risk", verdict: "FAIL", summary: `Flagged: ${data.threat.threatTypes.join(", ")}`, evidence: data }
      : { provider: "google-web-risk", verdict: "PASS", summary: "No match" };
  } catch (e) {
    return { provider: "google-web-risk", verdict: "INCONCLUSIVE", summary: `Lookup failed: ${String(e).slice(0, 120)}` };
  }
}

/** abuse.ch URLhaus. https://urlhaus-api.abuse.ch/ */
export async function urlhaus(url: string): Promise<ProviderResult> {
  const key = env().URLHAUS_AUTH_KEY;
  if (!key) return { provider: "urlhaus", verdict: "SKIPPED", summary: "Not configured (URLHAUS_AUTH_KEY)" };
  try {
    const res = await timed("https://urlhaus-api.abuse.ch/v1/url/", { method: "POST", headers: { "Auth-Key": key, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ url }) });
    if (!res.ok) return { provider: "urlhaus", verdict: "INCONCLUSIVE", summary: `Provider error ${res.status}` };
    const data = (await res.json()) as { query_status?: string; url_status?: string; threat?: string };
    if (data.query_status === "ok" && data.url_status !== "offline") return { provider: "urlhaus", verdict: "FAIL", summary: `Listed as ${data.threat ?? "malicious"}`, evidence: data as Record<string, unknown> };
    if (data.query_status === "no_results" || data.query_status === "ok") return { provider: "urlhaus", verdict: "PASS", summary: "No active listing" };
    return { provider: "urlhaus", verdict: "INCONCLUSIVE", summary: `Unexpected response: ${data.query_status}` };
  } catch (e) {
    return { provider: "urlhaus", verdict: "INCONCLUSIVE", summary: `Lookup failed: ${String(e).slice(0, 120)}` };
  }
}

/** VirusTotal v3 URL report (commercial use requires a premium licence). */
export async function virusTotal(url: string): Promise<ProviderResult> {
  const key = env().VIRUSTOTAL_API_KEY;
  if (!key) return { provider: "virustotal", verdict: "SKIPPED", summary: "Not configured (VIRUSTOTAL_API_KEY)" };
  try {
    const id = Buffer.from(url).toString("base64url");
    const res = await timed(`https://www.virustotal.com/api/v3/urls/${id}`, { headers: { "x-apikey": key } });
    if (res.status === 404) return { provider: "virustotal", verdict: "INCONCLUSIVE", summary: "URL not yet known to VirusTotal" };
    if (!res.ok) return { provider: "virustotal", verdict: "INCONCLUSIVE", summary: `Provider error ${res.status}` };
    const data = (await res.json()) as { data?: { attributes?: { last_analysis_stats?: { malicious?: number; suspicious?: number } } } };
    const s = data.data?.attributes?.last_analysis_stats ?? {};
    if ((s.malicious ?? 0) >= 2) return { provider: "virustotal", verdict: "FAIL", summary: `${s.malicious} engines flag this URL as malicious`, evidence: s };
    if ((s.malicious ?? 0) + (s.suspicious ?? 0) >= 1) return { provider: "virustotal", verdict: "WARN", summary: `${s.malicious ?? 0} malicious / ${s.suspicious ?? 0} suspicious detections`, evidence: s };
    return { provider: "virustotal", verdict: "PASS", summary: "No detections" };
  } catch (e) {
    return { provider: "virustotal", verdict: "INCONCLUSIVE", summary: `Lookup failed: ${String(e).slice(0, 120)}` };
  }
}

export function externalProvidersConfigured(): string[] {
  const e = env();
  return [e.GOOGLE_WEB_RISK_API_KEY && "google-web-risk", e.URLHAUS_AUTH_KEY && "urlhaus", e.VIRUSTOTAL_API_KEY && "virustotal"].filter(Boolean) as string[];
}
