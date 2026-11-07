import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, FormMessage, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireDev, canRole } from "@/server/developer/context";
import { complianceDocAction, reopenRevisionAction, submitListingAction } from "@/server/actions/developer";
import { appealAction } from "@/server/actions/public";

export default async function DevListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const ctx = await requireDev("ANALYST", `/developer/listings/${id}`);
  const l = await db.listing.findFirst({
    where: { id, developerId: ctx.org.id },
    include: {
      revisions: { orderBy: { revisionNumber: "desc" } }, statusHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      scans: { orderBy: { createdAt: "desc" }, take: 1, include: { checks: true } }, complianceDocs: { orderBy: { createdAt: "desc" } },
      primaryCategory: { include: { parent: true } },
    },
  });
  if (!l) notFound();
  const draft = l.revisions.find((r) => r.status === "DRAFT");
  const reopenable = l.revisions.find((r) => r.status === "INFO_REQUIRED" || (r.status === "REJECTED" && r === l.revisions[0]));
  const editor = canRole(ctx.role, "EDITOR");
  const needsDocs = l.primaryCategory && (l.primaryCategory.requiresComplianceDocs || l.primaryCategory.parent?.requiresComplianceDocs);
  const scan = l.scans[0];
  return (
    <>
      <Link href="/developer" className="text-sm text-muted hover:text-text">← All listings</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{l.name}</h1>
        <StatusPill status={l.status} />
        {l.status === "PUBLISHED" && <Link href={`/app/${l.slug}`} className="text-sm font-semibold text-brand hover:underline">View public page →</Link>}
      </div>
      {saved && <FormMessage tone="success">Draft saved.</FormMessage>}
      <div className="flex flex-wrap gap-2">
        {editor && <Link href={`/developer/listings/${id}/edit`} className={buttonClass("secondary", "md")}>Edit listing</Link>}
        <Link href={`/developer/listings/${id}/analytics`} className={buttonClass("secondary", "md")}>Analytics</Link>
        {editor && reopenable && <form action={reopenRevisionAction.bind(null, id, reopenable.id)}><button className={buttonClass("secondary", "md")}>Revise and resubmit</button></form>}
      </div>
      {(() => {
        const pending = l.revisions.find((r) => ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(r.status));
        if (!pending) return null;
        const text = pending.status === "UNDER_REVIEW" ? "Automated checks are complete. A WebCenter moderator is reviewing it." : "Automated security checks are running. This usually takes a few minutes.";
        return <FormMessage tone="info">Revision #{pending.revisionNumber} was submitted on {formatDate(pending.submittedAt)} and is being reviewed. {text} You will be notified of the decision.</FormMessage>;
      })()}
      {draft && editor && (
        <Card>
          <h2 className="font-semibold">Ready to submit revision #{draft.revisionNumber}?</h2>
          <p className="mb-3 text-sm text-muted">Submitting starts automated security checks. A moderator reviews the result; nothing is published automatically unless every check passes and the category allows it.</p>
          <ActionForm action={submitListingAction.bind(null, id)} submitLabel="Submit for review" pendingLabel="Submitting…">
            <Field label="Notes for the reviewer (optional)"><textarea name="notes" rows={2} maxLength={1000} className={inputClass} /></Field>
          </ActionForm>
        </Card>
      )}
      {["REJECTED", "SUSPENDED", "REMOVED"].includes(l.status) && editor && (
        <Card>
          <h2 className="font-semibold">Disagree with this decision?</h2>
          <p className="mb-3 text-sm text-muted">Submit an appeal. It is reviewed by a moderator other than the one who decided where possible.</p>
          <ActionForm action={appealAction.bind(null, { listingId: l.id })} submitLabel="Submit appeal" hideOnSuccess>
            <Field label="Your statement"><textarea name="statement" required minLength={20} maxLength={4000} rows={3} className={inputClass} /></Field>
          </ActionForm>
        </Card>
      )}
      <DataTable head={["Revision", "Status", "Submitted", "Decision"]} empty={l.revisions.length === 0}>
        {l.revisions.map((r) => (
          <tr key={r.id}>
            <td className={td}>#{r.revisionNumber}</td>
            <td className={td}><StatusPill status={r.status} /></td>
            <td className={td}>{formatDate(r.submittedAt)}</td>
            <td className={td}>{r.decisionNotes ?? "—"}</td>
          </tr>
        ))}
      </DataTable>
      {scan && (
        <Card>
          <h2 className="mb-1 font-semibold">Latest automated checks <StatusPill status={scan.overallVerdict ?? scan.status} /></h2>
          <p className="mb-3 text-xs text-muted">{formatDate(scan.createdAt)} · Passing checks do not guarantee safety; they inform the review.</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {scan.checks.map((c) => <li key={c.id} className="flex items-start gap-2"><StatusPill status={c.verdict} /><span>{c.check.replace(/_/g, " ").toLowerCase()}: <span className="text-muted">{c.summary}</span></span></li>)}
          </ul>
        </Card>
      )}
      {(needsDocs || l.complianceDocs.length > 0) && (
        <Card>
          <h2 className="mb-1 font-semibold">Licences & compliance documents</h2>
          <p className="mb-3 text-sm text-muted">This category requires evidence such as an operating licence. Documents are private and only visible to WebCenter moderators.</p>
          <ul className="mb-4 space-y-1 text-sm">{l.complianceDocs.map((d) => <li key={d.id}>{d.type.replace(/_/g, " ").toLowerCase()} {d.referenceNo ? `(${d.referenceNo})` : ""} <StatusPill status={d.decision} /></li>)}</ul>
          {editor && (
            <ActionForm action={complianceDocAction.bind(null, id)} submitLabel="Upload document">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type"><select name="type" className={inputClass}>{["OPERATING_LICENCE", "BUSINESS_REGISTRATION", "REGULATORY_REGISTRATION", "AGE_VERIFICATION_POLICY", "RISK_DISCLOSURE", "OTHER"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ").toLowerCase()}</option>)}</select></Field>
                <Field label="Jurisdiction"><input name="jurisdiction" maxLength={80} className={inputClass} /></Field>
                <Field label="Issuing body"><input name="issuingBody" maxLength={120} className={inputClass} /></Field>
                <Field label="Reference / licence number"><input name="referenceNo" maxLength={80} className={inputClass} /></Field>
              </div>
              <Field label="PDF file (max 10 MB)"><input type="file" name="file" accept="application/pdf" className="text-sm" /></Field>
            </ActionForm>
          )}
        </Card>
      )}
      <Card>
        <h2 className="mb-3 font-semibold">History</h2>
        <ul className="space-y-1 text-sm">{l.statusHistory.map((h) => <li key={h.id}>{formatDate(h.createdAt)} — {h.fromStatus ? `${h.fromStatus.toLowerCase()} → ` : ""}<strong>{h.toStatus.toLowerCase()}</strong>{h.reason ? <span className="text-muted"> · {h.reason}</span> : null}</li>)}</ul>
      </Card>
    </>
  );
}
