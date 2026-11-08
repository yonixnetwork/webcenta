import { ENV_VARIABLES } from "./inventory";
import { CATEGORIES, SECTIONS, sectionById } from "./registry";

const REQ = { always: "Required", production: "Required in production", optional: "Optional", never: "Must be unset in production" } as const;
const APPLY = { immediate: "Immediate", restart: "Restart", redeploy: "Redeploy" } as const;

/** docs/CONFIGURATION.md, generated from env-inventory.json and the settings registry. */
export function configurationDoc(): string {
  const out: string[] = [
    "# Webcenta — Configuration inventory",
    "",
    "<!-- Generated from src/server/settings/env-inventory.json and registry.ts by `npm run config:docs`. Do not edit by hand. -->",
    "",
    "Every environment variable the application reads, and every setting managed in **Admin → Settings**.",
    "",
    "* **Startup** variables are read before the application can reach MySQL, so they live in the hosting",
    "  environment (hPanel → Websites → Node.js → Environment variables) and need a restart or redeploy.",
    "* **Dashboard** settings are stored in MySQL (secrets encrypted with AES-256-GCM) and apply within seconds.",
    "  The environment variable with the same purpose is only a fallback while nothing is saved in the dashboard.",
    "",
    "## Minimum hosting environment",
    "",
    "| Variable | Why it cannot be a dashboard setting |",
    "| --- | --- |",
    ...ENV_VARIABLES.filter((v) => v.required === "always" || v.required === "production").map((v) => `| \`${v.name}\` | ${v.purpose} |`),
    "",
  ];
  for (const category of CATEGORIES) {
    const vars = ENV_VARIABLES.filter((v) => v.category === category);
    const sections = SECTIONS.filter((s) => s.group === category);
    if (!vars.length && !sections.length) continue;
    out.push(`## ${category}`, "");
    if (sections.length) {
      out.push("Dashboard: " + sections.map((s) => `**${s.title}** (${APPLY[s.apply].toLowerCase()}${s.testable ? ", connection test" : ""})`).join(", ") + ".", "");
    }
    if (vars.length) {
      out.push("| Variable | Purpose | Required | Secret | Startup | Managed in dashboard | Change needs |", "| --- | --- | --- | --- | --- | --- | --- |");
      for (const v of vars) {
        const s = v.dashboard ? sectionById(v.dashboard) : undefined;
        out.push(`| \`${v.name}\` | ${v.purpose} | ${REQ[v.required]} | ${v.secret ? "Yes" : "No"} | ${v.startup ? "Yes" : "No"} | ${s ? `Yes — ${s.title} (env is a fallback)` : "No"} | ${s ? APPLY[s.apply] : APPLY[v.apply]} |`);
      }
      out.push("");
    }
  }
  return out.join("\n");
}
