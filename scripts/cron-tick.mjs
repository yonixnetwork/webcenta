#!/usr/bin/env node
/**
 * Hostinger cron entry point (hPanel → Advanced → Cron Jobs → Custom):
 *
 *   /opt/alt/alt-nodejs22/root/usr/bin/node /home/<user>/domains/<domain>/hbuilds/current/nodejs/cron-tick.mjs
 *
 * prepare-standalone.mjs copies this file next to server.js. It reads PUBLIC_ORIGIN and
 * CRON_SECRET from the real environment or from the build's .env.production in the same
 * directory, then calls POST <PUBLIC_ORIGIN>/api/cron/tick with the secret in the Authorization
 * header — so no secret appears in the cron command, in hPanel or in a URL. Going through the
 * public HTTPS address also wakes the app when the hosting has idled it.
 * Prints one line (captured as the cron output) and exits 1 on failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Minimal reader for the snapshot format written by scripts/env-snapshot.mjs. */
function loadEnvFile(file) {
  let text;
  try { text = readFileSync(file, "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    const q = v[0];
    if ((q === "'" || q === '"' || q === "`") && v.endsWith(q)) v = v.slice(1, -1);
    if (q === '"') v = v.replace(/\\n/g, "\n");
    process.env[m[1]] = v.replace(/\\\$/g, "$");
  }
}

loadEnvFile(join(here, ".env.production"));
loadEnvFile(join(here, ".env"));

const origin = (process.env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
const secret = process.env.CRON_SECRET || "";
const stamp = new Date().toISOString();

if (!/^https?:\/\//.test(origin) || secret.length < 32) {
  console.log(`${stamp} webcenta cron: not configured (PUBLIC_ORIGIN or CRON_SECRET missing in the environment)`);
  process.exit(1);
}

try {
  const res = await fetch(`${origin}/api/cron/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "user-agent": "webcenta-cron/1" },
    signal: AbortSignal.timeout(110_000),
  });
  const body = await res.text();
  let summary = body.slice(0, 300);
  try {
    const r = JSON.parse(body);
    summary = r.skipped ? `skipped: another run is in progress (run ${r.runId})` : r.error ? `error: ${r.error}` : `run ${r.runId}: processed ${r.processed}, failed ${r.failed}, enqueued ${r.enqueued}, recovered ${r.recovered}, ${r.durationMs} ms`;
  } catch { /* not JSON */ }
  console.log(`${stamp} webcenta cron: HTTP ${res.status} ${summary}`);
  process.exit(res.ok ? 0 : 1);
} catch (e) {
  console.log(`${stamp} webcenta cron: request failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
