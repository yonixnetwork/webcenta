#!/usr/bin/env node
// Checks every translation catalogue against English: missing keys, keys English does not have,
// placeholder mismatches, empty values and markup. Exit code 1 on errors (not on missing keys,
// which fall back to English and are reported as coverage).
//   node scripts/i18n-check.mjs            summary per language
//   node scripts/i18n-check.mjs --missing  also list missing keys
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "src", "i18n", "messages");
const namespaces = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const locales = [...readFileSync(join(import.meta.dirname, "..", "src", "i18n", "locales.ts"), "utf8").matchAll(/L\("([A-Za-z-]+)"/g)].map((m) => m[1]);
const showMissing = process.argv.includes("--missing");
const texts = (v) => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v) : []);
const ph = (v) => [...new Set(texts(v).flatMap((t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort().join();

let errors = 0;
const rows = [];
for (const locale of locales) {
  let total = 0, done = 0; const missing = []; const problems = [];
  for (const ns of namespaces) {
    const en = JSON.parse(readFileSync(join(root, ns, "en.json"), "utf8"));
    const file = join(root, ns, `${locale}.json`);
    const other = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    for (const [key, ev] of Object.entries(en)) {
      total++;
      const v = other[key];
      if (v === undefined) { missing.push(`${ns}:${key}`); continue; }
      const t = texts(v);
      if (!t.length || (t.some((x) => !String(x).trim()) && !/(Before|After)$/.test(key))) problems.push(`${ns}:${key} empty`);
      else if (t.some((x) => /<[a-z/!]|javascript:|on\w+=/i.test(String(x)))) problems.push(`${ns}:${key} contains markup`);
      else if (typeof ev !== typeof v) problems.push(`${ns}:${key} plural forms differ from English`);
      else if (ph(ev) !== ph(v)) problems.push(`${ns}:${key} placeholders differ`);
      else done++;
    }
    for (const key of Object.keys(other)) if (!(key in en)) problems.push(`${ns}:${key} not in English`);
  }
  errors += problems.length;
  rows.push({ locale, pct: Math.floor((done / total) * 100), done, total, problems, missing });
}
for (const r of rows) {
  console.log(`${r.locale.padEnd(8)} ${String(r.pct).padStart(3)}%  ${r.done}/${r.total}${r.problems.length ? `  ERRORS: ${r.problems.length}` : ""}`);
  for (const p of r.problems) console.log(`   ✗ ${p}`);
  if (showMissing && r.missing.length && r.missing.length < r.total) for (const m of r.missing) console.log(`   · missing ${m}`);
}
console.log(`\n${rows.filter((r) => r.pct === 100).length} of ${rows.length} languages have every key; ${rows.filter((r) => r.pct === 0).length} have none (English is shown).`);
process.exit(errors ? 1 : 0);
