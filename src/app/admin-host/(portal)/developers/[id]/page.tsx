import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { decideComplianceDocAction, setOrgStatusAction, setOrgVerificationAction } from "@/server/actions/admin";

export default async function DeveloperAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("developers.verify");
  const { id } = await params;
  const o = await db.developerOrg.findUnique({ where: { id }, include: { members: { include: { user: true } }, domainVerifications: true, listings: true, complianceDocs: { orderBy: { createdAt: "desc" }, include: { listing: { select: { name: true } } } } } });
  if (!o) notFound();
  return (
    <>
      <Link href="/developers" className="text-sm text-muted hover:text-text">← Developers</Link>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight">{o.displayName}</h1><StatusPill status={o.verificationLevel} /><StatusPill status={o.status} /></div>
      <p className="text-sm text-muted">{o.legalName ?? "No legal name"} · {o.websiteUrl ?? "no website"} · {o.contactEmail ?? "no contact"} · {o.countryCode ?? "—"} · created {formatDate(o.createdAt)}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Verification level</h2>
          <ActionForm action={setOrgVerificationAction.bind(null, o.id)} submitLabel="Save" variant="secondary">
            <Field label="Level"><select name="level" defaultValue={o.verificationLevel} className={inputClass}><option value="UNVERIFIED">Unverified</option><option value="DOMAIN_VERIFIED">Domain verified</option><option value="BUSINESS_VERIFIED">Business verified (requires reviewed documents)</option></select></Field>
            <Field label="Evidence reviewed / notes"><input name="notes" className={inputClass} /></Field>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Account status</h2>
          {o.status === "SUSPENDED" ? <ActionForm action={setOrgStatusAction.bind(null, o.id, "ACTIVE")} submitLabel="Reinstate developer" /> : (
            <ActionForm action={setOrgStatusAction.bind(null, o.id, "SUSPENDED")} submitLabel="Suspend developer" variant="secondary"><Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
          )}
        </Card>
      </div>
      <h2 className="text-lg font-bold">Domains</h2>
      <DataTable head={["Domain", "Method", "Status", "Verified", "Last check"]} empty={o.domainVerifications.length === 0}>
        {o.domainVerifications.map((d) => <tr key={d.id}><td className={td}>{d.domain}</td><td className={td}>{d.method.toLowerCase()}</td><td className={td}><StatusPill status={d.status} /></td><td className={td}>{formatDate(d.verifiedAt)}</td><td className={td}>{formatDate(d.lastCheckedAt)} {d.failureReason ?? ""}</td></tr>)}
      </DataTable>
      <h2 className="text-lg font-bold">Compliance documents</h2>
      {o.complianceDocs.length === 0 ? <p className="text-sm text-muted">None.</p> : o.complianceDocs.map((d) => (
        <Card key={d.id} className="space-y-2">
          <p className="text-sm"><strong>{d.type.replace(/_/g, " ").toLowerCase()}</strong> {d.listing ? `for ${d.listing.name}` : ""} · {d.jurisdiction ?? "—"} · {d.issuingBody ?? "—"} · ref {d.referenceNo ?? "—"} <StatusPill status={d.decision} /></p>
          {d.assetId && <a href={`/documents/${d.id}`} className="text-sm font-semibold text-brand" target="_blank" rel="noopener noreferrer">Open PDF (private)</a>}
          <ActionForm action={decideComplianceDocAction.bind(null, d.id)} submitLabel="Save decision" variant="secondary">
            <div className="grid gap-2 sm:grid-cols-[200px_1fr]"><Field label="Decision"><select name="decision" className={inputClass}><option value="ACCEPTED">Accept</option><option value="INFO_REQUIRED">Request info</option><option value="REJECTED">Reject</option></select></Field><Field label="Notes"><input name="notes" className={inputClass} /></Field></div>
          </ActionForm>
        </Card>
      ))}
      <h2 className="text-lg font-bold">Members & listings</h2>
      <p className="text-sm">{o.members.map((m) => <Link key={m.userId} href={`/users/${m.userId}`} className="mr-3 text-brand">{m.user.email} ({m.role.toLowerCase()})</Link>)}</p>
      <p className="text-sm">{o.listings.map((l) => <Link key={l.id} href={`/listings/${l.id}`} className="mr-3 text-brand">{l.name} ({l.status.toLowerCase()})</Link>)}</p>
    </>
  );
}
