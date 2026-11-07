import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import { isBlockedHostname, isBlockedIp, testModeAllowsLoopback } from "./net";

/**
 * The ONLY way Webcenta fetches user-submitted URLs.
 *  - http/https only, default ports only, no credentials
 *  - DNS resolved here; every address must be public; the connection is then
 *    PINNED to the vetted address (no second lookup → no DNS rebinding)
 *  - redirects followed manually (max 5), each hop re-validated
 *  - strict timeouts and a response size cap; bodies are never executed
 */
export interface Hop { url: string; status: number; ip: string | null; location?: string }
export interface TlsInfo { issuer: string | null; validTo: Date | null; fingerprint: string | null; authorized: boolean; error?: string }
export interface SafeResponse {
  ok: boolean;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
  truncated: boolean;
  chain: Hop[];
  ips: string[];
  tls: TlsInfo | null;
  error?: { code: string; message: string };
  durationMs: number;
}

export class SafeFetchError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export const LIMITS = { maxRedirects: 5, connectTimeoutMs: 5000, totalTimeoutMs: 15000, maxBytes: 2 * 1024 * 1024 };

export async function validateUrl(raw: string): Promise<{ url: URL; addresses: string[] }> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SafeFetchError("INVALID_URL", "Invalid URL"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("BAD_SCHEME", "Only http and https are allowed");
  if (url.username || url.password) throw new SafeFetchError("CREDENTIALS", "URLs with credentials are not allowed");
  const allowLoopback = testModeAllowsLoopback() && url.hostname.endsWith(".localhost");
  if (url.port && !allowLoopback && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    throw new SafeFetchError("BAD_PORT", "Only default ports are allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (allowLoopback) addresses = ["127.0.0.1"];
  else if (isIP(host)) addresses = [host];
  else {
    if (isBlockedHostname(host)) throw new SafeFetchError("BLOCKED_HOST", "Hostname is not allowed");
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw new SafeFetchError("DNS_FAILED", "Domain does not resolve");
    }
  }
  if (addresses.length === 0) throw new SafeFetchError("DNS_FAILED", "Domain does not resolve");
  if (!allowLoopback && addresses.some(isBlockedIp)) throw new SafeFetchError("BLOCKED_ADDRESS", "Domain resolves to a private or reserved address");
  return { url, addresses };
}

function requestOnce(url: URL, ip: string, deadline: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean; tls: TlsInfo | null }> {
  return new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_host, opts, cb) => {
      const family = isIP(ip);
      if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: Array<{ address: string; family: number }>) => void)(null, [{ address: ip, family }]);
      else cb(null, ip, family);
    };
    const mod = url.protocol === "https:" ? https : http;
    const remaining = Math.max(500, deadline - Date.now());
    const req = mod.request(url, {
      method: "GET",
      lookup: pinned,
      agent: false,
      timeout: Math.min(LIMITS.connectTimeoutMs, remaining),
      headers: { "user-agent": "WebcentaSecurityScanner/1.0 (+https://webcenta.com/about)", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-encoding": "identity" },
      servername: isIP(url.hostname) ? undefined : url.hostname,
    });
    const timer = setTimeout(() => req.destroy(new SafeFetchError("TIMEOUT", "Request timed out")), remaining);
    req.on("timeout", () => req.destroy(new SafeFetchError("TIMEOUT", "Connection timed out")));
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.on("response", (res) => {
      let tls: TlsInfo | null = null;
      if (url.protocol === "https:") {
        const sock = res.socket as TLSSocket;
        const cert = sock.getPeerCertificate?.();
        tls = {
          issuer: cert?.issuer ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(" / ") : null,
          validTo: cert?.valid_to ? new Date(cert.valid_to) : null,
          fingerprint: cert?.fingerprint256 ?? null,
          authorized: sock.authorized,
        };
      }
      const chunks: Buffer[] = [];
      let size = 0, truncated = false;
      const ct = String(res.headers["content-type"] ?? "");
      const readBody = res.statusCode && res.statusCode < 300 && /text\/html|application\/xhtml|text\/plain/.test(ct);
      if (!readBody) { res.resume(); res.on("end", () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.alloc(0), truncated: false, tls }); }); return; }
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > LIMITS.maxBytes) { truncated = true; res.destroy(); return; }
        chunks.push(c);
      });
      const done = () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), truncated, tls }); };
      res.on("end", done);
      res.on("close", done);
      res.on("error", (e) => { clearTimeout(timer); if (truncated) done(); else reject(e); });
    });
    req.end();
  });
}

export async function safeFetch(raw: string): Promise<SafeResponse> {
  const started = Date.now();
  const deadline = started + LIMITS.totalTimeoutMs;
  const chain: Hop[] = [];
  const ips = new Set<string>();
  let current = raw;
  let tls: TlsInfo | null = null;
  for (let i = 0; i <= LIMITS.maxRedirects; i++) {
    let url: URL, addresses: string[];
    try {
      ({ url, addresses } = await validateUrl(current));
    } catch (e) {
      const err = e as SafeFetchError;
      chain.push({ url: current, status: 0, ip: null });
      return { ok: false, finalUrl: current, status: 0, headers: {}, body: "", bytes: 0, truncated: false, chain, ips: [...ips], tls, error: { code: err.code ?? "ERROR", message: err.message }, durationMs: Date.now() - started };
    }
    const ip = addresses[0]!;
    addresses.forEach((a) => ips.add(a));
    try {
      const res = await requestOnce(url, ip, deadline);
      if (i === 0 || url.protocol === "https:") tls = res.tls ?? tls;
      const location = res.headers.location;
      chain.push({ url: url.toString(), status: res.status, ip, ...(location ? { location: String(location) } : {}) });
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(String(location), url).toString();
        continue;
      }
      const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : String(v ?? "")]));
      return { ok: res.status < 400, finalUrl: url.toString(), status: res.status, headers, body: res.body.toString("utf8"), bytes: res.body.length, truncated: res.truncated, chain, ips: [...ips], tls, durationMs: Date.now() - started };
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { code?: string };
      chain.push({ url: url.toString(), status: 0, ip });
      const tlsError = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(String(err.code ?? err.message));
      if (tlsError) tls = { issuer: null, validTo: null, fingerprint: null, authorized: false, error: String(err.code ?? err.message) };
      return { ok: false, finalUrl: url.toString(), status: 0, headers: {}, body: "", bytes: 0, truncated: false, chain, ips: [...ips], tls,
        error: { code: tlsError ? "TLS_ERROR" : String(err.code ?? "NETWORK_ERROR"), message: String(err.message).slice(0, 300) }, durationMs: Date.now() - started };
    }
  }
  return { ok: false, finalUrl: current, status: 0, headers: {}, body: "", bytes: 0, truncated: false, chain, ips: [...ips], tls, error: { code: "TOO_MANY_REDIRECTS", message: `More than ${LIMITS.maxRedirects} redirects` }, durationMs: Date.now() - started };
}
