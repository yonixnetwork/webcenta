import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { decideClaimAction } from "@/server/actions/admin";

export const metadata = { title: "Claims" };

export default async function ClaimsAdmin() {
  await requireAdmin("developers.verify");
  const claims = await db.listingClaim.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { listing: true, org: true, domainVerification: true, requestedBy: { select: { email: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Listing claims</h1>
      {claims.length === 0 ? <p className="text-sm text-muted">No claims.</p> : claims.map((c) => (
        <div key={c.id} className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm"><StatusPill status={c.decision} /> <Link href={`/listings/${c.listingId}`} className="font-semibold text-brand">{c.listing.name}</Link> ({c.listing.domain}) claimed by <Link href={`/developers/${c.orgId}`} className="text-brand">{c.org.displayName}</Link> · {c.requestedBy.email} · {formatDate(c.createdAt)}</p>
          <p className="mt-1 text-sm text-muted">Verified domain: {c.domainVerification ? `${c.domainVerification.domain} (${c.domainVerification.status.toLowerCase()})` : "—"} {c.evidence ? `· Evidence: ${c.evidence}` : ""}</p>
          {c.decision === "PENDING" && (
            <div className="mt-3 flex flex-wrap gap-3">
              <ActionForm action={decideClaimAction.bind(null, c.id, true)} submitLabel="Accept claim"><Field label="Notes"><input name="notes" className={inputClass} /></Field></ActionForm>
              <ActionForm action={decideClaimAction.bind(null, c.id, false)} submitLabel="Reject claim" variant="secondary"><Field label="Reason"><input name="notes" className={inputClass} /></Field></ActionForm>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
