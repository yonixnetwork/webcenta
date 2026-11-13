import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { CheckDomainButton } from "@/components/portal/check-domain-button";
import { CopyField } from "@/components/portal/copy-field";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireDevPage } from "@/server/developer/context";
import { htmlFileContent, htmlFileName, TXT_PREFIX, txtHostLabel, WELL_KNOWN_PATH } from "@/server/developer/domain-verification";
import { checkDomainAction, startDomainAction } from "@/server/actions/developer";
import { developerPolicy } from "@/server/developer/policy";

export const metadata = { title: "Domains" };

const METHOD_LABEL: Record<string, string> = { DNS_TXT: "DNS TXT record", HTML_FILE: "HTML file upload", HTML_META: "HTML meta tag", WELL_KNOWN_FILE: "Well-known text file" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{n}</span><div className="min-w-0 flex-1 space-y-2">{children}</div></li>;
}

/** Plain-language instructions for each verification method, with the exact values to copy. */
function Instructions({ d }: { d: { domain: string; method: string; challenge: string } }) {
  if (d.method === "DNS_TXT") {
    const { host, zone } = txtHostLabel(d.domain);
    return (
      <ol className="space-y-4 text-sm">
        <Step n={1}><p>Sign in where you manage the DNS of <strong>{zone}</strong> (your domain registrar or DNS host, for example Cloudflare, GoDaddy, Namecheap or Hostinger) and open its DNS records.</p></Step>
        <Step n={2}>
          <p>Add a new record with these values:</p>
          <dl className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[140px_1fr]">
            <dt className="text-muted">Type</dt><dd className="font-mono font-semibold">TXT</dd>
            <dt className="text-muted">Host / Name</dt><dd><code className="font-mono font-semibold">{host}</code> <span className="text-xs text-muted">{host === "@" ? `(means ${zone} itself; some providers want the field empty or "${zone}")` : `(the part before ${zone}; some providers want the full name "${d.domain}")`}</span></dd>
            <dt className="text-muted">Domain it applies to</dt><dd className="font-mono">{d.domain}</dd>
            <dt className="text-muted">TTL</dt><dd>Default (or 1 hour)</dd>
          </dl>
          <CopyField label="Value / Content" value={`${TXT_PREFIX}${d.challenge}`} testId="challenge" />
          <p className="text-xs text-muted">Add it as a new record: keep your other TXT records (for example SPF for email).</p>
        </Step>
        <Step n={3}><p>Save, then press <strong>Check verification</strong>. DNS changes usually appear within minutes but can take a few hours; you can check again any time.</p></Step>
      </ol>
    );
  }
  if (d.method === "HTML_FILE") {
    const file = htmlFileName(d.challenge);
    return (
      <ol className="space-y-4 text-sm">
        <Step n={1}><p>Download this file (or create a file with exactly this name and content):</p>
          <CopyField label={`File name`} value={file} />
          <CopyField label="File content" value={htmlFileContent(d.challenge)} download={file} testId="challenge" />
        </Step>
        <Step n={2}><p>Upload it to the <strong>top folder of the website</strong> (the folder that contains its home page, often <code className="font-mono">public_html</code>, <code className="font-mono">public</code> or <code className="font-mono">static</code>), so that this address opens it:</p>
          <CopyField label="Verification address" value={`https://${d.domain}/${file}`} />
        </Step>
        <Step n={3}><p>Open that address in your browser to make sure it works, then press <strong>Check verification</strong>. The file must be served by {d.domain} itself over HTTPS, without redirecting to another domain.</p></Step>
      </ol>
    );
  }
  if (d.method === "HTML_META") {
    return (
      <ol className="space-y-4 text-sm">
        <Step n={1}><p>Copy this tag:</p><CopyField label="Meta tag" value={`<meta name="webcenta-verification" content="${d.challenge}">`} testId="challenge" /></Step>
        <Step n={2}><p>Paste it inside the <code className="font-mono">&lt;head&gt;</code> section of the home page <strong>https://{d.domain}/</strong>, next to the other <code className="font-mono">&lt;meta&gt;</code> tags. Website builders usually have a &ldquo;custom code in head&rdquo; or &ldquo;header code&rdquo; setting for this.</p></Step>
        <Step n={3}><p>Publish the change, then press <strong>Check verification</strong>. Webcenta loads the home page and looks for the tag; it must be in the HTML the server sends (not only added later by JavaScript).</p></Step>
      </ol>
    );
  }
  return (
    <ol className="space-y-4 text-sm">
      <Step n={1}><p>Create a plain text file containing only this code:</p><CopyField label="File content" value={d.challenge} testId="challenge" /></Step>
      <Step n={2}><p>Make it available at:</p><CopyField label="Verification address" value={`https://${d.domain}${WELL_KNOWN_PATH}`} /></Step>
      <Step n={3}><p>Then press <strong>Check verification</strong>.</p></Step>
    </ol>
  );
}

export default async function DomainsPage() {
  const { methods } = await developerPolicy();
  const ctx = await requireDevPage("ANALYST", "/domains");
  const domains = await db.domainVerification.findMany({ where: { orgId: ctx.org.id }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Domain ownership</h1>
      <p className="text-sm text-muted">Before you submit an app, prove that your organisation controls the website&apos;s domain (proving a domain also covers its subdomains). Choose one method; you only need one. Verification is re-checked from time to time, so leave the record or file in place.</p>
      <Card>
        <h2 className="mb-3 font-semibold">Verify a domain</h2>
        <ActionForm action={startDomainAction} submitLabel="Get verification code">
          <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
            <Field label="Domain" hint="Without https://, for example example.com or app.example.com."><input name="domain" required placeholder="app.example.com" className={inputClass} /></Field>
            <Field label="Method">
              <select name="method" className={inputClass} defaultValue={methods[0]}>
                {methods.includes("DNS_TXT") && <option value="DNS_TXT">DNS TXT record (recommended)</option>}
                {methods.includes("HTML_FILE") && <option value="HTML_FILE">HTML file upload</option>}
                {methods.includes("HTML_META") && <option value="HTML_META">HTML meta tag</option>}
                {methods.includes("WELL_KNOWN_FILE") && <option value="WELL_KNOWN_FILE">Well-known text file</option>}
              </select>
            </Field>
          </div>
          <ul className="grid gap-1 text-xs text-muted sm:grid-cols-3">
            <li><strong className="text-text">DNS TXT:</strong> best if you can edit your domain&apos;s DNS.</li>
            <li><strong className="text-text">HTML file:</strong> best if you can upload files to the website.</li>
            <li><strong className="text-text">Meta tag:</strong> best for website builders with a header-code setting.</li>
          </ul>
        </ActionForm>
      </Card>
      <ul className="space-y-3">
        {domains.map((d) => (
          <li key={d.id} className="rounded-2xl border border-border bg-surface p-4" data-domain={d.domain}>
            <div className="flex flex-wrap items-center gap-2"><strong className="[overflow-wrap:anywhere]">{d.domain}</strong><StatusPill status={d.status} /><span className="text-xs text-subtle">{METHOD_LABEL[d.method] ?? d.method} · last checked {formatDate(d.lastCheckedAt)}{d.status !== "VERIFIED" && d.challengeExpiresAt ? ` · code valid until ${formatDate(d.challengeExpiresAt)}` : ""}</span></div>
            {d.status !== "VERIFIED" && (
              <div className="mt-4 space-y-3">
                <Instructions d={d} />
                {d.failureReason && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Last check: {d.failureReason}</p>}
              </div>
            )}
            <div className="mt-3"><CheckDomainButton action={checkDomainAction.bind(null, d.id)} /></div>
          </li>
        ))}
      </ul>
    </>
  );
}
