import Link from "next/link";
import { stringArray } from "@/lib/json-arrays";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { InlineAction } from "@/components/portal/inline-action";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { alertAction, scanNowAction, setListingStatusAction } from "@/server/actions/admin";

export default async function AlertDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("security.manage");
  const { id } = await params;
  const a = await db.securityAlert.findUnique({ where: { id }, include: { listing: true, scan: { include: { checks: true } }, assignedAdmin: { select: { name: true } } } });
  if (!a) notFound();
  const open = a.status === "OPEN" || a.status === "INVESTIGATING";
  return (
    <>
      <Link href="/security" className="text-sm text-muted hover:text-text">← Security</Link>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight">{a.listing.name}</h1><StatusPill status={a.severity} /><StatusPill status={a.status} />{a.autoRestricted && <StatusPill status="RESTRICTED" />}</div>
      <p className="text-sm">{a.title}</p>
      <p className="text-xs text-muted">Raised {formatDate(a.createdAt)} · listing <Link href={`/listings/${a.listingId}`} className="text-brand">{a.listing.status.toLowerCase()} / {a.listing.securityStatus.toLowerCase()}</Link> · {a.listing.websiteUrl}{a.assignedAdmin ? ` · handled by ${a.assignedAdmin.name}` : ""}</p>
      {a.resolutionNotes && <p className="rounded-xl bg-surface-2 p-3 text-sm">Findings: {a.resolutionNotes}</p>}
      {a.scan && (
        <Card>
          <h2 className="mb-2 font-semibold">Evidence — scan of {formatDate(a.scan.createdAt)}</h2>
          <p className="mb-2 text-xs text-muted">Final URL {a.scan.finalUrl} · HTTP {a.scan.httpStatus ?? "—"} · IPs {stringArray(a.scan.resolvedIps).join(", ") || "—"} · title “{a.scan.pageTitle ?? ""}”</p>
          <ul className="space-y-1 text-sm">{a.scan.checks.map((c) => <li key={c.id} className="flex gap-2"><StatusPill status={c.verdict} /><span>{c.check.replace(/_/g, " ").toLowerCase()} ({c.provider}): <span className="text-muted">{c.summary}</span></span></li>)}</ul>
          {a.scan.redirectChain && <details className="mt-2 text-xs"><summary className="cursor-pointer">Redirect chain</summary><pre className="mt-1 overflow-auto rounded bg-surface-2 p-2">{JSON.stringify(a.scan.redirectChain, null, 2)}</pre></details>}
        </Card>
      )}
      <div className="flex flex-wrap gap-2"><InlineAction action={scanNowAction.bind(null, a.listingId)} label="Re-scan now" /></div>
      {open && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="font-semibold">Investigation outcome</h2>
            <ActionForm action={alertAction.bind(null, a.id)} submitLabel="Record outcome">
              <Field label="Outcome"><select name="op" className={inputClass}><option value="INVESTIGATING">Mark as investigating</option><option value="RESOLVED_FALSE_POSITIVE">False positive (restore visibility)</option><option value="RESOLVED_NO_ACTION">Resolved, no action needed (restore visibility)</option><option value="RESOLVED_ACTION_TAKEN">Resolved, action taken</option></select></Field>
              <Field label="Findings (required to resolve)"><textarea name="notes" rows={3} className={inputClass} /></Field>
            </ActionForm>
          </Card>
          <Card className="space-y-3">
            <h2 className="font-semibold">Take action on the listing</h2>
            <ActionForm action={setListingStatusAction.bind(null, a.listingId, "SUSPENDED")} submitLabel="Suspend listing" variant="secondary"><Field label="Reason"><input name="reason" required defaultValue={`Security: ${a.title}`.slice(0, 200)} className={inputClass} /></Field></ActionForm>
            <ActionForm action={setListingStatusAction.bind(null, a.listingId, "REMOVED")} submitLabel="Remove listing" variant="secondary"><Field label="Reason"><input name="reason" required className={inputClass} /></Field></ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
