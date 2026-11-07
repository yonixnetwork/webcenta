import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { CheckDomainButton } from "@/components/portal/check-domain-button";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireDev } from "@/server/developer/context";
import { TXT_PREFIX, WELL_KNOWN_PATH } from "@/server/developer/domain-verification";
import { checkDomainAction, startDomainAction } from "@/server/actions/developer";

export const metadata = { title: "Domains" };

export default async function DomainsPage() {
  const ctx = await requireDev("ANALYST", "/developer/domains");
  const domains = await db.domainVerification.findMany({ where: { orgId: ctx.org.id }, orderBy: { createdAt: "desc" } });
  const code = "rounded-lg bg-surface-2 px-2 py-1 font-mono text-xs break-all";
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Domain ownership</h1>
      <p className="text-sm text-muted">Prove you control a domain before submitting apps hosted on it (or its subdomains). Verification is re-checked periodically; removing the proof later lapses the verification.</p>
      <Card>
        <h2 className="mb-3 font-semibold">Verify a domain</h2>
        <ActionForm action={startDomainAction} submitLabel="Get verification code">
          <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
            <Field label="Domain"><input name="domain" required placeholder="app.example.com" className={inputClass} /></Field>
            <Field label="Method">
              <select name="method" className={inputClass} defaultValue="DNS_TXT">
                <option value="DNS_TXT">DNS TXT record</option><option value="HTML_META">HTML meta tag</option><option value="WELL_KNOWN_FILE">Verification file</option>
              </select>
            </Field>
          </div>
        </ActionForm>
      </Card>
      <ul className="space-y-3">
        {domains.map((d) => (
          <li key={d.id} className="rounded-2xl border border-border bg-surface p-4" data-domain={d.domain}>
            <div className="flex flex-wrap items-center gap-2"><strong>{d.domain}</strong><StatusPill status={d.status} /><span className="text-xs text-subtle">{d.method.replace(/_/g, " ").toLowerCase()} · last checked {formatDate(d.lastCheckedAt)}</span></div>
            {d.status !== "VERIFIED" && (
              <div className="mt-3 space-y-2 text-sm">
                {d.method === "DNS_TXT" && <p>Add a TXT record on <strong>{d.domain}</strong> with the value <code className={code} data-testid="challenge">{TXT_PREFIX}{d.challenge}</code></p>}
                {d.method === "HTML_META" && <p>Add this tag inside <code className={code}>&lt;head&gt;</code> of https://{d.domain}/: <code className={code} data-testid="challenge">&lt;meta name=&quot;webcenta-verification&quot; content=&quot;{d.challenge}&quot;&gt;</code></p>}
                {d.method === "WELL_KNOWN_FILE" && <p>Serve a text file at <code className={code}>https://{d.domain}{WELL_KNOWN_PATH}</code> containing <code className={code} data-testid="challenge">{d.challenge}</code></p>}
                {d.failureReason && <p className="text-danger">Last check: {d.failureReason}</p>}
              </div>
            )}
            <div className="mt-3"><CheckDomainButton action={checkDomainAction.bind(null, d.id)} /></div>
          </li>
        ))}
      </ul>
    </>
  );
}
