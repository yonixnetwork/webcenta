// Fixture websites for E2E tests (scanner, domain verification, redirects).
// HTTPS on :443 for *.localhost hosts; control API on http://127.0.0.1:4599.
import { createServer as https } from "node:https";
import { createServer as http } from "node:http";
import { readFileSync } from "node:fs";

const dir = new URL("./.certs/", import.meta.url);
const state = new Map(); // host -> { mode, verification }
const get = (host) => state.get(host) ?? { mode: "normal", verification: "" };

const ICON = readFileSync(new URL("../../public/icons/icon-512.png", import.meta.url));
const OG = readFileSync(new URL("../../public/brand/og-default.png", import.meta.url));

function page(host, s) {
  const name = host.split(".")[0];
  if (s.mode === "app") {
    return `<!doctype html><html lang="en"><head><title>${name} App | Fixture</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="${name} helps teams plan projects and share notes in the browser. A local fixture for import tests.">
<meta property="og:site_name" content="${name} App"><meta property="og:image" content="/og.png"><link rel="manifest" href="/manifest.json"><link rel="apple-touch-icon" href="/icon.png"></head>
<body><h1>${name}</h1><a href="/pricing">Pricing</a> <a href="/privacy">Privacy Policy</a> <a href="/terms">Terms</a><p>Start for free.</p></body></html>`;
  }
  if (s.mode === "phishing") {
    return `<!doctype html><html><head><title>Wallet sync</title></head><body><h1>Validate your wallet</h1><p>Enter your 12-word seed phrase to restore and sync your wallet.</p><form action="/x"><textarea name="phrase"></textarea><button>Restore</button></form></body></html>`;
  }
  return `<!doctype html><html><head><title>${name} — fixture app</title>${s.verification ? `<meta name="webcenta-verification" content="${s.verification}">` : ""}</head>
<body><h1>${name}</h1><p>This is a local fixture website used by Webcenta end-to-end tests.</p><a href="/privacy">Privacy</a></body></html>`;
}

const site = https({ key: readFileSync(new URL("site.key", dir)), cert: readFileSync(new URL("site.pem", dir)) }, (req, res) => {
  const host = (req.headers.host ?? "").split(":")[0];
  const s = get(host);
  const path = (req.url ?? "/").split("?")[0];
  // Redirect/down/download modes apply to every path (including verification files).
  if (s.mode === "redirect-private") { res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end(); }
  if (s.mode === "redirect-evil") { res.writeHead(302, { location: "https://evil-site.localhost/landing" }); return res.end(); }
  if (s.mode === "down") { res.writeHead(503); return res.end("down"); }
  if (path === "/.well-known/webcenta-verification.txt") {
    res.writeHead(s.verification ? 200 : 404, { "content-type": "text/plain" });
    return res.end(s.verification || "not found");
  }
  if (s.mode === "app" && path === "/manifest.json") { res.writeHead(200, { "content-type": "application/manifest+json" }); return res.end(JSON.stringify({ name: `${host.split(".")[0]} App`, display: "standalone", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }], screenshots: [{ src: "/og.png", sizes: "1200x630", type: "image/png", form_factor: "wide" }] })); }
  if (s.mode === "app" && path === "/icon.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(ICON); }
  if (s.mode === "app" && path === "/og.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(OG); }
  if (s.mode === "app" && path === "/privacy") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<html><title>Privacy Policy</title><body><h1>Privacy Policy of ${host}</h1><p>${"This privacy policy explains how we collect and use personal data when you use our website. ".repeat(20)}</p></body></html>`); }
  if (path === "/privacy" || path === "/terms") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(`<html><title>Privacy Policy</title><body><h1>Privacy Policy of ${host}</h1><p>${"This privacy policy explains how we collect and use personal data when you use our website. ".repeat(20)}</p></body></html>`);
  }
  switch (s.mode) {
    case "down": res.writeHead(503); return res.end("down");
    case "redirect-evil": res.writeHead(302, { location: "https://evil-site.localhost/landing" }); return res.end();
    case "redirect-private": res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }); return res.end();
    case "download": res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=setup.exe" }); return res.end("MZ");
    default: res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(page(host, s));
  }
});

const control = http((req, res) => {
  if (req.url === "/health") { res.writeHead(200); return res.end("ok"); }
  if (req.method === "POST" && req.url === "/__control") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { host, mode, verification } = JSON.parse(body);
      state.set(host, { ...get(host), ...(mode ? { mode } : {}), ...(verification !== undefined ? { verification } : {}) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(get(host)));
    });
    return;
  }
  res.writeHead(404); res.end();
});

site.listen(Number(process.env.FIXTURE_HTTPS_PORT ?? 443), "127.0.0.1");
control.listen(4599, "127.0.0.1", () => console.log("fixture sites ready"));
