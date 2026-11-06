import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { decideAppealAction } from "@/server/actions/admin";

export const metadata = { title: "Appeals" };

export default async function AppealsAdmin() {
  await requireAdmin("content.moderate");
  const appeals = await db.appeal.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { appellant: { select: { email: true } }, listing: { select: { id: true, name: true, status: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Appeals</h1>
      {appeals.length === 0 ? <p className="text-sm text-muted">No appeals.</p> : (
        <ul className="space-y-3">{appeals.map((a) => (
          <li key={a.id} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm"><StatusPill status={a.status} /> {a.appellant.email} · {formatDate(a.createdAt)} {a.listing && <>· <Link href={`/listings/${a.listing.id}`} className="text-brand">{a.listing.name}</Link> ({a.listing.status.toLowerCase()})</>}</p>
            <p className="mt-2 rounded-lg bg-surface-2 p-2 text-sm">{a.statement}</p>
            {a.decisionNotes && <p className="mt-1 text-sm text-muted">Decision: {a.decisionNotes}</p>}
            {(a.status === "OPEN" || a.status === "IN_REVIEW") && (
              <ActionForm action={decideAppealAction.bind(null, a.id)} submitLabel="Save" variant="secondary" className="mt-3 flex flex-wrap items-end gap-2 space-y-0">
                <Field label="Decision"><select name="decision" className={inputClass}><option value="IN_REVIEW">In review</option><option value="UPHELD">Uphold original decision</option><option value="OVERTURNED">Overturn (then reinstate on the listing page)</option></select></Field>
                <Field label="Notes to appellant"><input name="notes" className={inputClass} /></Field>
              </ActionForm>
            )}
          </li>
        ))}</ul>
      )}
    </>
  );
}
