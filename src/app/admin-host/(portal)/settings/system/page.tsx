import Link from "next/link";
import { Card } from "@/components/ui/form";
import { requireAdmin } from "@/server/admin/auth";
import { inventoryStatus } from "@/server/settings/inventory";
import { sectionById } from "@/server/settings/registry";

export const metadata = { title: "Configuration inventory" };

const APPLY = { immediate: "Immediate", restart: "Restart", redeploy: "Redeploy" } as const;
const REQUIRED = { always: "Required", production: "Required in production", optional: "Optional", never: "Must be unset in production" } as const;

/**
 * Every environment variable the application reads, with what it is for, whether
 * it is secret, needed at startup or managed here, and what a change needs.
 * Only whether a variable is set is shown — never a value.
 */
export default async function ConfigurationInventory() {
  await requireAdmin("settings.manage");
  const groups = inventoryStatus();
  const isProd = process.env.NODE_ENV === "production";
  return (
    <>
      <p className="text-sm"><Link href="/settings" className="text-brand hover:underline">← Settings</Link></p>
      <h1 className="text-2xl font-extrabold tracking-tight">Configuration inventory</h1>
      <Card className="space-y-2 text-sm">
        <p>The dashboard does not edit Hostinger&apos;s environment variables. <strong>Startup</strong> variables are read before the application can reach its database (the database address, the encryption root key, the public address), so they must stay in hPanel → Websites → Node.js → Environment variables; change them there, then redeploy.</p>
        <p>Everything marked <strong>Dashboard</strong> is configured at runtime in Admin → Settings and stored in MySQL (secrets encrypted). The environment variable of the same purpose is only a fallback used while nothing has been saved in the dashboard.</p>
      </Card>
      {groups.map((g) => (
        <section key={g.category} aria-labelledby={`c-${g.category}`} className="space-y-2">
          <h2 id={`c-${g.category}`} className="text-lg font-bold">{g.category}</h2>
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-subtle">
                <tr><th className="px-3 py-2">Variable</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2">Required</th><th className="px-3 py-2">Where</th><th className="px-3 py-2">Change needs</th><th className="px-3 py-2">In this environment</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.variables.map((v) => {
                  const section = v.dashboard ? sectionById(v.dashboard) : undefined;
                  const needed = v.required === "always" || (v.required === "production" && isProd);
                  const bad = (needed && !v.set) || (v.required === "never" && v.set && isProd);
                  return (
                    <tr key={v.name} className="align-top">
                      <td className="px-3 py-2"><code className="font-semibold">{v.name}</code>{v.secret && <span className="ml-1 rounded bg-warning-soft px-1 text-[10px] font-bold uppercase text-warning">secret</span>}</td>
                      <td className="px-3 py-2 text-muted">{v.purpose}</td>
                      <td className="px-3 py-2">{REQUIRED[v.required]}</td>
                      <td className="px-3 py-2">{section ? <Link href={`/settings/${section.id}`} className="text-brand hover:underline">Dashboard: {section.title}</Link> : v.startup ? "Hosting (startup)" : "Hosting"}</td>
                      <td className="px-3 py-2">{section ? APPLY[section.apply] : APPLY[v.apply]}</td>
                      <td className={`px-3 py-2 ${bad ? "font-semibold text-danger" : v.set ? "text-success" : "text-subtle"}`}>{v.set ? (v.required === "never" && isProd ? "Set — remove it" : section ? "Set (fallback)" : "Set") : needed ? "Missing" : section ? "Not set (use the dashboard)" : "Not set"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
