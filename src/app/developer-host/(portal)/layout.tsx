import type { Metadata } from "next";
import { DevNav } from "@/components/portal/dev-nav";
import { getDevContext } from "@/server/developer/context";
import { switchOrgAction } from "@/server/actions/developer";
import { StatusPill } from "@/components/portal/table";

export const metadata: Metadata = { title: { default: "Developer portal", template: "%s · Developer portal · Webcenta" }, robots: { index: false } };

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDevContext("/");
  if (!ctx) return <div className="mx-auto max-w-2xl">{children}</div>;
  return (
    <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
      <aside className="space-y-4">
        <div className="hidden rounded-2xl border border-border bg-surface p-3 lg:block">
          <p className="text-xs text-subtle">Organisation</p>
          <p className="truncate font-semibold">{ctx.org.displayName}</p>
          <div className="mt-1 flex flex-wrap gap-1"><StatusPill status={ctx.org.verificationLevel} />{ctx.org.status !== "ACTIVE" && <StatusPill status={ctx.org.status} />}</div>
          {ctx.orgs.length > 1 && (
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {ctx.orgs.filter((o) => o.id !== ctx.org.id).map((o) => (
                <form key={o.id} action={switchOrgAction.bind(null, o.id)}><button className="text-xs text-brand hover:underline">Switch to {o.displayName}</button></form>
              ))}
            </div>
          )}
        </div>
        <DevNav />
      </aside>
      <div className="min-w-0 space-y-6">
        {ctx.org.status !== "ACTIVE" && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">This organisation is suspended{ctx.org.suspendReason ? `: ${ctx.org.suspendReason}` : ""}. You cannot submit or update listings.</p>}
        {children}
      </div>
    </div>
  );
}
