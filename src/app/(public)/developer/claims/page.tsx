import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireDev } from "@/server/developer/context";
import { claimListingAction } from "@/server/actions/developer";

export const metadata = { title: "Claim a listing" };

export default async function ClaimsPage() {
  const ctx = await requireDev("ANALYST", "/developer/claims");
  const claims = await db.listingClaim.findMany({ where: { orgId: ctx.org.id }, include: { listing: { select: { name: true, domain: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Claim an editorial listing</h1>
      <p className="text-sm text-muted">If Webcenta editors listed your app, you can take over its management after verifying ownership of its domain.</p>
      <Card>
        <ActionForm action={claimListingAction} submitLabel="Request claim">
          <Field label="Listing URL or slug"><input name="slug" required placeholder="https://webcenta.com/app/your-app" className={inputClass} /></Field>
          <Field label="Additional evidence (optional)"><textarea name="evidence" rows={2} maxLength={2000} className={inputClass} /></Field>
        </ActionForm>
      </Card>
      <ul className="space-y-2">{claims.map((c) => <li key={c.id} className="rounded-xl border border-border bg-surface p-3 text-sm">{c.listing.name} ({c.listing.domain}) <StatusPill status={c.decision} /> <span className="text-subtle">{formatDate(c.createdAt)}</span>{c.decisionNotes && <span className="block text-muted">{c.decisionNotes}</span>}</li>)}</ul>
    </>
  );
}
