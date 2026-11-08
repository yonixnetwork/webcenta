import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireDevPage } from "@/server/developer/context";
import { sponsorshipRequestAction } from "@/server/actions/developer";

export const metadata = { title: "Plans & promotion" };

export default async function PromotePage() {
  const ctx = await requireDevPage("ANALYST", "/developer/promote");
  const [plans, subs, requests, listings] = await Promise.all([
    db.developerPlan.findMany({ orderBy: { createdAt: "asc" } }),
    db.developerSubscription.findMany({ where: { orgId: ctx.org.id }, include: { plan: true } }),
    db.sponsorship.findMany({ where: { orgId: ctx.org.id }, include: { listing: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.listing.findMany({ where: { developerId: ctx.org.id, status: "PUBLISHED" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Plans & promotion</h1>
      <Card>
        <h2 className="mb-1 font-semibold">Your plan: {subs[0]?.plan.name ?? "Free"}</h2>
        <p className="text-sm text-muted">Listing on Webcenta is free. Paid plans are not available yet: pricing and billing have not been launched.</p>
        {plans.length > 0 && <ul className="mt-3 grid gap-3 sm:grid-cols-3">{plans.map((p) => (
          <li key={p.id} className="rounded-xl border border-border p-3 text-sm"><strong>{p.name}</strong><p className="text-muted">{p.isActive && p.priceCents != null ? `${(p.priceCents / 100).toFixed(2)} ${p.currency}` : "Not available yet"}</p></li>
        ))}</ul>}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Request a sponsored placement</h2>
        <p className="mb-3 text-sm text-muted">Sponsored placements are always labelled “Sponsored”, never change organic rankings or search order, and require a published listing in good standing. Requests are reviewed manually; no payment is taken at this stage.</p>
        {listings.length === 0 ? <p className="text-sm text-muted">You need a published listing first.</p> : (
          <ActionForm action={sponsorshipRequestAction} submitLabel="Send request">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Listing"><select name="listingId" className={inputClass}>{listings.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
              <Field label="Placement"><select name="slot" className={inputClass}><option value="HOME_FEATURED">Homepage featured</option><option value="CATEGORY_TOP">Top of category</option><option value="SEARCH_TOP">Top of search</option></select></Field>
            </div>
            <Field label="Message (optional)"><textarea name="message" rows={2} maxLength={1000} className={inputClass} /></Field>
          </ActionForm>
        )}
      </Card>
      <DataTable head={["Listing", "Placement", "Status", "Requested"]} empty={requests.length === 0}>
        {requests.map((r) => <tr key={r.id}><td className={td}>{r.listing.name}</td><td className={td}>{r.slot.replace(/_/g, " ").toLowerCase()}</td><td className={td}><StatusPill status={r.status} /></td><td className={td}>{formatDate(r.createdAt)}</td></tr>)}
      </DataTable>
    </>
  );
}
