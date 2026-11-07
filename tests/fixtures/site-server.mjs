// Fixture websites for E2E tests (scanner, domain verification, redirects).
// HTTPS on :443 for *.localhost hosts; control API on http://127.0.0.1:4599.
import { createServer as https } from "node:https";
import { createServer as http } from "node:http";
import { readFileSync } from "node:fs";

const dir = new URL("./.certs/", import.meta.url);
const state = new Map(); // host -> { mode, verification }
const get = (host) => state.get(host) ?? { mode: "normal", verification: "" };

function page(host, s) {
  const name = host.split(".")[0];
  if (s.mode === "phishing") {
    return `<!doctype html><html><head><title>Wallet sync</title></head><body><h1>Validate your wallet</h1><p>Enter your 12-word seed phrase to restore and sync your wallet.</p><form action="/x"><textarea name="phrase"></textarea><button>Restore</button></form></body></html>`;
  }
  return `<!doctype html><html><head><title>${name} — fixture app</title>${s.verification ? `<meta name="webcenter-verification" content="${s.verification}">` : ""}</head>
<body><h1>${name}</h1><p>This is a local fixture website used by WebCenter end-to-end tests.</p><a href="/privacy">Privacy</a></body></html>`;
}

const site = https({ key: readFileSync(new URL("site.key", dir)), cert: readFileSync(new URL("site.pem", dir)) }, (req, res) => {
  const host = (req.headers.host ?? "").split(":")[0];
  const s = get(host);
  const path = (req.url ?? "/").split("?")[0];
  if (path === "/.well-known/webcenter-verification.txt") {
    res.writeHead(s.verification ? 200 : 404, { "content-type": "text/plain" });
    return res.end(s.verification || "not found");
  }
  if (path === "/privacy" || path === "/terms") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html><title>Policy</title><body>Policy</body></html>"); }
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
